import { prisma, type PrismaClient } from "@solmarket/database";
import { GammaClient, type GammaMarket } from "../polymarket/gamma";

export interface AutoListerResult {
    discovered: number;
    skippedExisting: number;
    failed: number;
}

export interface AutoListerOptions {
    intervalMs?: number;
    batchLimit?: number;
    gamma?: GammaClient;
    db?: PrismaClient;
}

export class AutoLister {
    private readonly gamma: GammaClient;
    private readonly db: PrismaClient;
    private readonly intervalMs: number;
    private readonly batchLimit: number;
    private handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(options: AutoListerOptions = {}) {
        this.gamma = options.gamma ?? new GammaClient();
        this.db = options.db ?? prisma;
        this.intervalMs = options.intervalMs ?? 60_000;
        this.batchLimit = options.batchLimit ?? 50;
    }

    async runOnce(): Promise<AutoListerResult> {
        const markets = await this.gamma.fetch_markets({
            limit: this.batchLimit,
            order: "volume_24hr",
            ascending: false,
        });

        let discovered = 0;
        let skippedExisting = 0;
        let failed = 0;

        for (const m of markets) {
            try {
                const result = await this.upsertOne(m);
                if (result === "discovered") discovered++;
                else skippedExisting++;
            } catch (err) {
                failed++;
                console.error(`[auto-lister] failed to upsert ${m.id}:`, err);
            }
        }

        return { discovered, skippedExisting, failed };
    }

    start(): void {
        if (this.handle) return;
        void this.tick();
        this.handle = setInterval(() => void this.tick(), this.intervalMs);
    }

    stop(): void {
        if (this.handle) {
            clearInterval(this.handle);
            this.handle = null;
        }
    }

    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.runOnce();
        } catch (err) {
            console.error("[auto-lister] tick failed:", err);
        } finally {
            this.running = false;
        }
    }

    private async upsertOne(market: GammaMarket): Promise<"discovered" | "skipped"> {
        // Skip negative-risk markets — they're multi-outcome composites that
        // don't fit our binary YES/NO model for MVP.
        if (market.neg_risk) return "skipped";

        const existing = await this.db.market.findFirst({
            where: { polyMarketId: market.id },
            select: { id: true },
        });
        if (existing) return "skipped";

        const { yes_token_id, no_token_id } = GammaClient.pick_yes_no_token_ids(market);

        await this.db.$transaction(async (tx) => {
            await tx.polyMarket.upsert({
                where: { id: market.id },
                create: {
                    id: market.id,
                    slug: market.slug || null,
                    yesTokenId: yes_token_id,
                    noTokenId: no_token_id,
                    tickSize: market.minimum_tick_size,
                    negRisk: market.neg_risk,
                },
                update: {
                    slug: market.slug || null,
                    yesTokenId: yes_token_id,
                    noTokenId: no_token_id,
                    tickSize: market.minimum_tick_size,
                    negRisk: market.neg_risk,
                },
            });

            const created = await tx.market.create({
                data: {
                    name: market.question,
                    description: market.description,
                    polyMarketId: market.id,
                    endAt: new Date(market.end_date_iso),
                },
            });

            await tx.listing.create({
                data: {
                    marketId: created.id,
                    status: "PENDING",
                    volume24hUsd: market.volume_24hr,
                    liquidityUsd: market.liquidity,
                    lastSyncedAt: new Date(),
                },
            });
        });

        return "discovered";
    }
}

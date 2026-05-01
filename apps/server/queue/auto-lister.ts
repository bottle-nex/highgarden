import { prisma, type PrismaClient } from "@solmarket/database";
import { GammaClient, type GammaMarket } from "../polymarket/gamma";

const MIN_LIFESPAN_MS = 24 * 60 * 60 * 1000;
const MIN_ACTIVITY_USD = 1000;

export interface AutoListerResult {
    discovered: number;
    skippedExisting: number;
    skippedFiltered: number;
    failed: number;
    candidates: number;
}

type UpsertOutcome = "discovered" | "existing" | "filtered";

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
        const by_volume = await this.gamma.fetch_markets({
            limit: this.batchLimit,
            order: "volume_24hr",
            ascending: false,
        });
        const by_recency = await this.gamma.fetch_markets({
            limit: this.batchLimit,
            order: "start_date",
            ascending: false,
        });

        const seen = new Set<string>();
        const candidates: GammaMarket[] = [];
        for (const m of [...by_volume, ...by_recency]) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            candidates.push(m);
        }

        let discovered = 0;
        let skippedExisting = 0;
        let skippedFiltered = 0;
        let failed = 0;

        for (const m of candidates) {
            try {
                const result = await this.upsertOne(m);
                if (result === "discovered") discovered++;
                else if (result === "existing") skippedExisting++;
                else skippedFiltered++;
            } catch (err) {
                failed++;
                console.error(`[auto-lister] failed to upsert ${m.id}:`, err);
            }
        }

        console.log(
            `[auto-lister] candidates=${candidates.length} discovered=${discovered} ` +
                `existing=${skippedExisting} filtered=${skippedFiltered} failed=${failed}`,
        );
        return {
            discovered,
            skippedExisting,
            skippedFiltered,
            failed,
            candidates: candidates.length,
        };
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

    private async upsertOne(market: GammaMarket): Promise<UpsertOutcome> {
        // Skip negative-risk markets — they're multi-outcome composites that
        // don't fit our binary YES/NO model for MVP.
        if (market.neg_risk) return "filtered";

        // Drop short-window auto-generated ladders (e.g. crypto Up/Down 5min,
        // strike-price markets that expire same-day) and zero-activity rows.
        const lifespan_ms = new Date(market.end_date_iso).getTime() - Date.now();
        if (lifespan_ms < MIN_LIFESPAN_MS) return "filtered";
        if (market.volume_24hr < MIN_ACTIVITY_USD && market.liquidity < MIN_ACTIVITY_USD) {
            return "filtered";
        }

        const existing = await this.db.market.findFirst({
            where: { polyMarketId: market.id },
            select: { id: true },
        });
        if (existing) return "existing";

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

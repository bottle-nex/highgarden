import { prisma } from "@solmarket/database";
import { Outcome } from "@solmarket/types";
import SolanaAdminService from "./service.solana-admin";
import MarketLifecyclePublisher from "./service.market-lifecycle";
import {
    ASSET_BINANCE_SYMBOL,
    ASSET_RTDS_TARGETS,
    asset_prefix_for_series,
    fetch_binance_kline_open_at,
} from "./service.rtds-mapping";

/**
 * Self-resolves FAST_MOVING Up/Down markets the moment their window
 * closes, using the start- and end-price snapshots the RoundAnchor
 * recorder is already writing to `RoundAnchorPrice` every minute. The
 * start price of slot N is the row at `endAt - cadence`; the end price
 * of slot N is the row at `endAt` (it's also the start price of slot
 * N+1 — both slots share that minute boundary).
 *
 * Resolution rule mirrors Polymarket's: `end >= start → UP wins (YES)`,
 * otherwise DOWN (NO). End-price equal to start counts as UP per the
 * upstream market description.
 *
 * Trade-off — accepted explicitly: we resolve before Polymarket's
 * Chainlink-driven settlement lands. On close calls (end ≈ start, gap
 * within a few hundred ms of the official tick) our outcome can
 * disagree with Polymarket's eventual settlement; the hedger's redeem
 * step then redeems for Polymarket's winner, leaving the platform short
 * the difference. Acceptable in exchange for instant claim UX.
 *
 * Coordination with the hedger:
 *   • We jump straight from PENDING → SOLANA_RESOLVED on ResolverState.
 *     The hedger's `list_awaiting_solana_resolution` filter (stage =
 *     POLYMARKET_RESOLVED) skips our rows — no double-resolve.
 *   • The hedger's redeem step still picks our rows up (stage =
 *     SOLANA_RESOLVED && polymarketRedeemTxHash IS NULL), retries
 *     until Polymarket actually settles, then redeems.
 */
const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 20;

const CADENCE_MS_BY_SUFFIX: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
};

export default class FastResolverService {
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        // eslint-disable-next-line no-unused-vars
        private readonly solana_admin: SolanaAdminService,
        // eslint-disable-next-line no-unused-vars
        private readonly market_lifecycle: MarketLifecyclePublisher,
    ) {}

    public start(): void {
        if (this.timer) return;
        if (!this.solana_admin.is_resolve_configured()) {
            console.warn(
                "[fast-resolver] SERVER_SOLANA_ORACLE_KEYPAIR not set — self-resolve disabled",
            );
            return;
        }
        this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
        console.log(`[fast-resolver] started (interval=${POLL_INTERVAL_MS}ms)`);
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.run_once();
        } catch (err) {
            console.error("[fast-resolver] tick failed", err);
        } finally {
            this.running = false;
        }
    }

    private async run_once(): Promise<void> {
        const now = new Date();
        const candidates = await prisma.market.findMany({
            where: {
                kind: "FAST_MOVING",
                status: { not: "RESOLVED" },
                endAt: { lte: now },
                solanaMarketPda: { not: null },
                fastSeriesKey: { not: null },
                listing: { status: "APPROVED" },
            },
            select: {
                id: true,
                endAt: true,
                fastSeriesKey: true,
                solanaMarketPda: true,
            },
            take: BATCH_SIZE,
        });
        // Serial processing: each resolve_market is an on-chain tx (~3-5s
        // confirmation). Parallel would race the same oracle nonce and
        // tank — better to drain the batch over multiple ticks.
        for (const m of candidates) {
            await this.try_resolve(m);
        }
    }

    private async try_resolve(market: {
        id: string;
        endAt: Date;
        fastSeriesKey: string | null;
        solanaMarketPda: string | null;
    }): Promise<void> {
        if (!market.fastSeriesKey || !market.solanaMarketPda) return;

        const cadence_ms = FastResolverService.cadence_ms_for_series(market.fastSeriesKey);
        if (cadence_ms <= 0) return;

        const symbol = FastResolverService.symbol_for_series(market.fastSeriesKey);
        if (!symbol) return;

        const slot_start_ms = Math.floor(
            (market.endAt.getTime() - cadence_ms) / 60_000,
        ) * 60_000;
        const slot_end_ms = Math.floor(market.endAt.getTime() / 60_000) * 60_000;

        const start = await FastResolverService.resolve_price_at(
            symbol,
            market.fastSeriesKey,
            slot_start_ms,
        );
        const end = await FastResolverService.resolve_price_at(
            symbol,
            market.fastSeriesKey,
            slot_end_ms,
        );
        // Both sources empty: recorder hasn't captured the end-minute
        // yet AND Binance couldn't backfill (e.g. brand-new slot, end
        // minute still in flight). Skip this tick — next tick (1s
        // later) will retry. If our recorder never recovers AND Binance
        // stays unreachable, the hedger's slow-path eventually settles
        // the market the usual way.
        if (start === null || end === null) return;

        // Upstream: "Up" wins if end >= start. Match the rule literally.
        const winning: "YES" | "NO" = end >= start ? "YES" : "NO";

        let result;
        try {
            result = await this.solana_admin.resolve_market({
                marketPda: market.solanaMarketPda,
                winningOutcome: winning,
            });
        } catch (err) {
            console.error(
                "[fast-resolver] on-chain resolve_market failed",
                market.id,
                err,
            );
            return;
        }

        const resolved_at = await FastResolverService.persist_resolution(
            market.id,
            result.winningOutcome,
            result.signature,
            start,
            end,
        );

        try {
            await this.market_lifecycle.publish_resolved({
                marketId: market.id,
                winningOutcome: result.winningOutcome as Outcome,
                resolvedAt: resolved_at.toISOString(),
                claimable: true,
            });
        } catch (err) {
            console.error("[fast-resolver] lifecycle publish failed", market.id, err);
        }

        console.log(
            `[fast-resolver] resolved ${market.id} ${winning} start=${start} end=${end} sig=${result.signature.slice(0, 12)}…`,
        );
    }

    /** Mirrors `ResolveMarketController.persist_resolution` — flips
     *  Market + ResolverState in one transaction so the hedger's
     *  solana-resolve step skips this row and the redeem step picks it
     *  up. `notes` carries the start/end prices for incident review. */
    private static async persist_resolution(
        market_id: string,
        winning_outcome: "YES" | "NO",
        tx_signature: string,
        start_price: number,
        end_price: number,
    ): Promise<Date> {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.market.update({
                where: { id: market_id },
                data: {
                    status: "RESOLVED",
                    winningOutcome: winning_outcome,
                    resolvedAt: now,
                    pausedReason: null,
                },
            });
            const notes = `fast-self-resolve start=${start_price} end=${end_price}`;
            await tx.resolverState.upsert({
                where: { marketId: market_id },
                create: {
                    marketId: market_id,
                    stage: "SOLANA_RESOLVED",
                    polymarketResolvedAt: now,
                    winningOutcome: winning_outcome,
                    solanaResolveTxSig: tx_signature,
                    solanaResolvedAt: now,
                    notes,
                },
                update: {
                    stage: "SOLANA_RESOLVED",
                    winningOutcome: winning_outcome,
                    solanaResolveTxSig: tx_signature,
                    solanaResolvedAt: now,
                    polymarketResolvedAt: now,
                    notes,
                },
            });
        });
        return now;
    }

    /** Returns the asset price at the given minute boundary. Tries the
     *  RoundAnchorPrice DB row first (RTDS-captured tick — matches
     *  Polymarket's source exactly). Falls back to Binance 1m kline
     *  open at the same minute and caches the result back to the table
     *  so subsequent reads stay consistent and don't re-fetch.
     *
     *  Returns null only when both sources fail — typically because the
     *  minute is still in flight (no Binance kline yet) or the asset
     *  has no Binance equivalent (HYPE). Callers retry on the next
     *  resolver tick. */
    private static async resolve_price_at(
        rtds_symbol: string,
        series_key: string,
        minute_ms: number,
    ): Promise<number | null> {
        const slot_start = new Date(minute_ms);
        const cached = await prisma.roundAnchorPrice.findUnique({
            where: {
                symbol_slotStart: { symbol: rtds_symbol, slotStart: slot_start },
            },
        });
        if (cached) {
            const v = Number(cached.price);
            if (Number.isFinite(v)) return v;
        }
        if (minute_ms > Date.now()) return null;
        const prefix = asset_prefix_for_series(series_key);
        const binance_symbol = prefix ? ASSET_BINANCE_SYMBOL[prefix] : undefined;
        if (!binance_symbol) return null;
        const fallback = await fetch_binance_kline_open_at(binance_symbol, minute_ms);
        if (fallback === null) return null;
        // Cache the fallback back to RoundAnchorPrice so the controller
        // and any subsequent resolver tick read the same value. First
        // writer wins — never clobber a real RTDS tick that may land
        // a moment later.
        try {
            await prisma.roundAnchorPrice.upsert({
                where: {
                    symbol_slotStart: { symbol: rtds_symbol, slotStart: slot_start },
                },
                create: {
                    symbol: rtds_symbol,
                    slotStart: slot_start,
                    price: fallback.toString(),
                },
                update: {},
            });
        } catch (err) {
            console.warn(
                "[fast-resolver] backfill cache failed",
                rtds_symbol,
                slot_start.toISOString(),
                err,
            );
        }
        return fallback;
    }

    private static cadence_ms_for_series(series_key: string): number {
        const m = series_key.match(/-(\d+)([mh])$/i);
        if (!m) return 0;
        const value = parseInt(m[1]!, 10);
        const unit = m[2]!.toLowerCase();
        const base = CADENCE_MS_BY_SUFFIX[unit];
        if (!Number.isFinite(value) || value <= 0 || !base) return 0;
        return value * base;
    }

    private static symbol_for_series(series_key: string): string | null {
        const prefix = asset_prefix_for_series(series_key);
        if (!prefix) return null;
        return ASSET_RTDS_TARGETS[prefix]?.symbol ?? null;
    }
}

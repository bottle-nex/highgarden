import { prisma, type PrismaClient } from "@solmarket/database";
import { GammaClient, type GammaMarket } from "../polymarket/gamma";
import ApproveAndListService from "../services/service.approve-and-list";

const MIN_LIFESPAN_MS = 24 * 60 * 60 * 1000;
const MIN_ACTIVITY_USD = 1000;
/** Liquidity floor for fast markets — 24h-volume filter is useless on
 *  markets that have existed for <1 hour. Polymarket's BTC/ETH/SOL
 *  ladders routinely show $5k+ liquidity from the makers; below that
 *  it's probably a dead variant (HYPE / fringe coin with no taker flow). */
const FAST_MIN_LIQUIDITY_USD = 500;

/**
 * Polymarket's fast-resolution ladders follow the shape
 * `<Asset> Up or Down - <date>`. Anchoring the regex at the START of
 * the question keeps esports props that happen to mention "up or
 * down" mid-sentence out of the fast-moving classification — only
 * markets whose first token is an asset symbol followed by
 * "Up or Down" match.
 *
 *   Matches:    "Bitcoin Up or Down - …", "BNB Up or Down - …",
 *               "Solana Up or Down - …", "XRP Up or Down - …"
 *   Skips:      "Game 1: Both Teams …", "Map 2: Odd/Even Total Kills?",
 *               "Will Bitcoin price go up or down next quarter?"
 */
const FAST_MOVING_QUESTION_PATTERN = /^[A-Za-z]{2,15}\s+up or down\b/i;

/**
 * Extracts the stable series key from a Polymarket slug. Their fast
 * crypto ladders use slugs like `doge-updown-15m-1778769000` or
 * `bitcoin-updown-5m-1778769300` — `<asset>-updown-<cadence>-<unix-ts>`.
 * Stripping the trailing timestamp gives a key that's stable across
 * every market in the same series (asset + cadence), which is what
 * `FastMarketSubscription` matches against.
 *
 * Returns null when the slug doesn't match the recognised pattern so
 * STANDARD markets and any oddly-slugged FAST_MOVING markets just get
 * `fastSeriesKey = null`.
 */
function derive_fast_series_key(slug: string | null | undefined): string | null {
    if (!slug) return null;
    const m = slug.match(/^([a-z0-9]+)-updown-([0-9]+[a-z])-(\d+)$/i);
    if (!m) return null;
    const [, asset, cadence] = m;
    return `${asset!.toLowerCase()}-updown-${cadence!.toLowerCase()}`;
}

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
    private readonly approver: ApproveAndListService;
    private handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(options: AutoListerOptions = {}) {
        this.gamma = options.gamma ?? new GammaClient();
        this.db = options.db ?? prisma;
        this.intervalMs = options.intervalMs ?? 60_000;
        this.batchLimit = options.batchLimit ?? 50;
        this.approver = new ApproveAndListService();
    }

    async runOnce(): Promise<AutoListerResult> {
        const by_volume = await this.gamma.fetch_events({
            limit: this.batchLimit,
            order: "volume_24hr",
            ascending: false,
        });
        const by_recency = await this.gamma.fetch_events({
            limit: this.batchLimit,
            order: "start_date",
            ascending: false,
        });
        // Surface short-window markets that lose to long-form ones on volume
        // and recency: Polymarket's 5-min Bitcoin Up-or-Down ladders, hourly
        // ETH/SOL price markets, etc. We hit `/markets` directly (not
        // `/events`) sorted by `endDate` ascending so the ones about to
        // resolve come back first. Non-fatal if upstream rejects the
        // unknown sort field — we still get the other two batches.
        const by_ending_soon = await this.fetch_ending_soon();

        const seen = new Set<string>();
        const candidates: GammaMarket[] = [];
        for (const m of [...by_volume, ...by_recency, ...by_ending_soon]) {
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

    /**
     * Pulls markets ordered by `endDate` ascending — the closest-to-resolve
     * first. Polymarket's 5-min Bitcoin Up-or-Down ladders fill the top of
     * this list. Gamma might not honour the `endDate` sort on every
     * deployment (it isn't formally documented); the call is best-effort
     * and any error degrades gracefully to an empty array so the other
     * two discovery passes still run.
     */
    private async fetch_ending_soon(): Promise<GammaMarket[]> {
        try {
            // Use `/markets` instead of `/events` so we don't get rate-limited
            // out of seeing ladders that don't appear in top events.
            // Bumped limit because Polymarket emits these ladders in big
            // batches (one per 5-min slot across multiple assets).
            // `end_date_min=now` skips zombie markets — Polymarket leaves
            // already-ended markets flagged active until the operator
            // closes them, and `endDate ascending` would otherwise return
            // a wall of them at the top.
            return await this.gamma.fetch_markets({
                limit: Math.max(this.batchLimit * 2, 100),
                order: "end_date",
                ascending: true,
                end_date_min: new Date().toISOString(),
            });
        } catch (err) {
            console.warn(
                "[auto-lister] fetch_ending_soon failed (continuing without short-window batch)",
                (err as Error)?.message ?? err,
            );
            return [];
        }
    }

    private async upsertOne(market: GammaMarket): Promise<UpsertOutcome> {
        // Skip negative-risk markets — they're multi-outcome composites that
        // don't fit our binary YES/NO model for MVP.
        if (market.neg_risk) return "filtered";

        const lifespan_ms = new Date(market.end_date_iso).getTime() - Date.now();
        // Already ended (or about to) — gamma sometimes still returns these.
        if (lifespan_ms <= 0) return "filtered";

        // Classify by QUESTION PATTERN only. Lifespan alone is a noisy
        // signal — every esports prop ending today is sub-hour and
        // would otherwise flood the fast-moving tab. The "Up or Down"
        // ladders are the markets the test loop actually wants, and
        // their question text is the most reliable identifier.
        // Standard markets still need ≥ 24h runway AND meaningful 24h
        // volume or liquidity; fast markets only need a liquidity floor.
        const is_fast_moving = FAST_MOVING_QUESTION_PATTERN.test(market.question);
        if (is_fast_moving) {
            if (market.liquidity < FAST_MIN_LIQUIDITY_USD) return "filtered";
        } else {
            if (lifespan_ms < MIN_LIFESPAN_MS) return "filtered";
            if (
                market.volume_24hr < MIN_ACTIVITY_USD
                && market.liquidity < MIN_ACTIVITY_USD
            ) {
                return "filtered";
            }
        }
        const kind: "STANDARD" | "FAST_MOVING" = is_fast_moving ? "FAST_MOVING" : "STANDARD";

        const { yes_token_id, no_token_id } = GammaClient.pick_yes_no_token_ids(market);

        // Always keep PolyMarket metadata (imageUrl, slug, eventId, tags, ...)
        // up to date. Don't blow away tags if upstream returns an empty list
        // for a row that previously had them — empty is much more often "the
        // /markets endpoint just didn't include the field" than "this market
        // truly has no tags".
        const update_data: Record<string, unknown> = {
            slug: market.slug || null,
            eventId: market.event_id,
            eventSlug: market.event_slug,
            yesTokenId: yes_token_id,
            noTokenId: no_token_id,
            tickSize: market.minimum_tick_size,
            negRisk: market.neg_risk,
            imageUrl: market.image_url,
        };
        if (market.tags.length > 0) update_data.tags = market.tags;

        await this.db.polyMarket.upsert({
            where: { id: market.id },
            create: {
                id: market.id,
                slug: market.slug || null,
                eventId: market.event_id,
                eventSlug: market.event_slug,
                yesTokenId: yes_token_id,
                noTokenId: no_token_id,
                tickSize: market.minimum_tick_size,
                negRisk: market.neg_risk,
                imageUrl: market.image_url,
                tags: market.tags,
            },
            update: update_data,
        });

        const existing = await this.db.market.findFirst({
            where: { polyMarketId: market.id },
            select: { id: true },
        });
        if (existing) return "existing";

        // For FAST_MOVING markets, derive the series key now so the
        // auto-approval lookup below has it available and any future
        // queries by series can use the indexed column.
        const fast_series_key = is_fast_moving
            ? derive_fast_series_key(market.slug)
            : null;

        const created_market_id = await this.db.$transaction(async (tx) => {
            const created = await tx.market.create({
                data: {
                    name: market.question,
                    description: market.description,
                    polyMarketId: market.id,
                    endAt: new Date(market.end_date_iso),
                    kind,
                    fastSeriesKey: fast_series_key,
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
            return created.id;
        });

        // Auto-approve + list if a FastMarketSubscription exists for
        // this series. Failures are logged but don't bubble — the
        // discovery itself already succeeded; the operator can manually
        // approve from the admin UI if the auto-approval errored.
        if (fast_series_key) {
            await this.maybe_auto_approve(created_market_id, fast_series_key);
        }

        return "discovered";
    }

    /**
     * If a FastMarketSubscription is enabled for `series_key`, runs the
     * normal approve-and-list flow (creates the on-chain market PDA,
     * flips listing to APPROVED, wires the mirror). Logs and swallows
     * errors — a transient failure here just means the next tick or a
     * manual click can finish the job.
     */
    private async maybe_auto_approve(market_id: string, series_key: string): Promise<void> {
        const sub = await this.db.fastMarketSubscription.findUnique({
            where: { seriesKey: series_key },
            select: { id: true, enabled: true, label: true },
        });
        if (!sub || !sub.enabled) return;
        try {
            await this.approver.approve(market_id, "auto-lister");
            console.info(
                `[auto-lister] auto-approved ${market_id} via subscription "${sub.label}" (${series_key})`,
            );
        } catch (err) {
            console.error(
                `[auto-lister] auto-approve failed for ${market_id} (series=${series_key})`,
                (err as Error)?.message ?? err,
            );
        }
    }
}

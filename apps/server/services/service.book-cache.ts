import Redis from "ioredis";
import { REDIS_CHANNELS, type MarketEvent } from "@solmarket/polymarket-contracts";

export interface TopOfBook {
    bestBid: number | null;
    bestAsk: number | null;
    midPrice: number | null;
    updatedAt: number;
}

interface BookSide {
    /** price → size; 0 size means the level is gone. */
    levels: Map<number, number>;
}

/**
 * In-memory cache of best-bid / best-ask per Polymarket asset (token_id).
 *
 * Subscribes to the per-asset Redis channels published by apps/mirror. Owns
 * its own Redis client because SUBSCRIBE puts the connection into a mode that
 * disallows normal commands — sharing services.redis would break it.
 *
 * The future /quote endpoint will read from this cache to compute spread-
 * adjusted prices.
 */
export default class BookCache {
    private readonly sub: Redis;
    private readonly tracked = new Set<string>();
    private readonly bids = new Map<string, BookSide>();
    private readonly asks = new Map<string, BookSide>();
    private readonly tops = new Map<string, TopOfBook>();

    constructor(redis_url: string) {
        this.sub = new Redis(redis_url);
        this.sub.on("pmessage", (_pattern, channel, raw) => this.handle(channel, raw));
    }

    public async track(token_ids: string[]): Promise<void> {
        const fresh = token_ids.filter((id) => !this.tracked.has(id));
        if (fresh.length === 0) return;

        for (const id of fresh) {
            this.tracked.add(id);
            this.bids.set(id, { levels: new Map() });
            this.asks.set(id, { levels: new Map() });
        }

        await this.psubscribe_for(fresh);
        console.log(`[book-cache] tracking ${fresh.length} new asset(s)`);
    }

    public async untrack(token_ids: string[]): Promise<void> {
        const known = token_ids.filter((id) => this.tracked.has(id));
        if (known.length === 0) return;

        for (const id of known) {
            this.tracked.delete(id);
            this.bids.delete(id);
            this.asks.delete(id);
            this.tops.delete(id);
        }

        await this.punsubscribe_for(known);
        console.log(`[book-cache] dropped ${known.length} asset(s)`);
    }

    public getTopOfBook(token_id: string): TopOfBook | null {
        return this.tops.get(token_id) ?? null;
    }

    public snapshot(): Record<string, TopOfBook> {
        return Object.fromEntries(this.tops);
    }

    public has_token(token_id: string): boolean {
        return this.tracked.has(token_id);
    }

    public snapshot_tracked(): Array<{
        token_id: string;
        top: TopOfBook | null;
        bid_levels: number;
        ask_levels: number;
    }> {
        const out: Array<{
            token_id: string;
            top: TopOfBook | null;
            bid_levels: number;
            ask_levels: number;
        }> = [];
        for (const id of this.tracked) {
            out.push({
                token_id: id,
                top: this.tops.get(id) ?? null,
                bid_levels: this.bids.get(id)?.levels.size ?? 0,
                ask_levels: this.asks.get(id)?.levels.size ?? 0,
            });
        }
        return out;
    }

    public get_depth(
        token_id: string,
        depth: number,
    ): {
        bids: Array<{ price: number; size: number }>;
        asks: Array<{ price: number; size: number }>;
    } | null {
        const bids = this.bids.get(token_id);
        const asks = this.asks.get(token_id);
        if (!bids || !asks) return null;

        const bid_levels: Array<{ price: number; size: number }> = [];
        for (const [price, size] of bids.levels) {
            if (size > 0) bid_levels.push({ price, size });
        }
        bid_levels.sort((a, b) => b.price - a.price);

        const ask_levels: Array<{ price: number; size: number }> = [];
        for (const [price, size] of asks.levels) {
            if (size > 0) ask_levels.push({ price, size });
        }
        ask_levels.sort((a, b) => a.price - b.price);

        return {
            bids: bid_levels.slice(0, depth),
            asks: ask_levels.slice(0, depth),
        };
    }

    public async shutdown(): Promise<void> {
        await this.sub.quit();
    }

    // ────────────────────────────────────────────────────────────────────────
    // Private: redis subscription + event application.

    private async psubscribe_for(token_ids: string[]): Promise<void> {
        const patterns: string[] = [];
        for (const id of token_ids) {
            patterns.push(REDIS_CHANNELS.market_book(id), REDIS_CHANNELS.market_price(id));
        }
        await this.sub.psubscribe(...patterns);
    }

    private async punsubscribe_for(token_ids: string[]): Promise<void> {
        const patterns: string[] = [];
        for (const id of token_ids) {
            patterns.push(REDIS_CHANNELS.market_book(id), REDIS_CHANNELS.market_price(id));
        }
        await this.sub.punsubscribe(...patterns);
    }

    private handle(channel: string, raw: string): void {
        let event: MarketEvent;
        try {
            event = JSON.parse(raw) as MarketEvent;
        } catch {
            console.warn(`[book-cache] malformed event on ${channel}`);
            return;
        }

        const token_id = event.asset_id;
        const label = this.label_for?.(token_id) ?? short(token_id);
        if (!this.tracked.has(token_id)) {
            console.log(`[3.redis→cache] DROP untracked market=${label} type=${event.event_type}`);
            return;
        }

        if (event.event_type === "book") {
            this.apply_snapshot(token_id, event.bids, event.asks);
            console.log(
                `[3.redis→cache] APPLY book market=${label} bids=${event.bids.length} asks=${event.asks.length}`,
            );
        } else if (event.event_type === "price_change") {
            this.apply_changes(token_id, event.changes);
            console.log(
                `[3.redis→cache] APPLY price_change market=${label} changes=${event.changes.length}`,
            );
        } else {
            return;
        }

        this.recompute_top(token_id);
    }

    /** Optional marketId/name resolver, injected after construction. */
    // eslint-disable-next-line no-unused-vars
    public label_for: ((token_id: string) => string) | null = null;

    private apply_snapshot(
        token_id: string,
        bids: Array<{ price: string; size: string }>,
        asks: Array<{ price: string; size: string }>,
    ): void {
        const bid_levels = new Map<number, number>();
        for (const { price, size } of bids) {
            const p = Number(price);
            const s = Number(size);
            if (Number.isFinite(p) && s > 0) bid_levels.set(p, s);
        }
        const ask_levels = new Map<number, number>();
        for (const { price, size } of asks) {
            const p = Number(price);
            const s = Number(size);
            if (Number.isFinite(p) && s > 0) ask_levels.set(p, s);
        }
        this.bids.set(token_id, { levels: bid_levels });
        this.asks.set(token_id, { levels: ask_levels });
    }

    private apply_changes(
        token_id: string,
        changes: Array<{ price: string; size: string; side: "BUY" | "SELL" }>,
    ): void {
        const bids = this.bids.get(token_id);
        const asks = this.asks.get(token_id);
        if (!bids || !asks) return;

        for (const { price, size, side } of changes) {
            const p = Number(price);
            const s = Number(size);
            if (!Number.isFinite(p)) continue;
            // Polymarket convention: BUY = bid side, SELL = ask side.
            const target = side === "BUY" ? bids.levels : asks.levels;
            if (s <= 0) {
                target.delete(p);
            } else {
                target.set(p, s);
            }
        }
    }

    private recompute_top(token_id: string): void {
        const bids = this.bids.get(token_id);
        const asks = this.asks.get(token_id);
        if (!bids || !asks) return;

        let bestBid: number | null = null;
        for (const price of bids.levels.keys()) {
            if (bestBid === null || price > bestBid) bestBid = price;
        }
        let bestAsk: number | null = null;
        for (const price of asks.levels.keys()) {
            if (bestAsk === null || price < bestAsk) bestAsk = price;
        }
        const midPrice =
            bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

        this.tops.set(token_id, {
            bestBid,
            bestAsk,
            midPrice,
            updatedAt: Date.now(),
        });
    }
}

function short(token_id: string): string {
    if (token_id.length <= 12) return token_id;
    return `${token_id.slice(0, 8)}…${token_id.slice(-4)}`;
}

import { SEED_MARKETS } from "./markets";

export interface BookLevel {
    price: number;
    size: number;
}

export interface BookSnapshot {
    tokenId: string;
    asks: BookLevel[];
    bids: BookLevel[];
    lastTradePriceCents: number;
    updatedAt: number;
}

export type BookEventType = "book" | "price_change" | "last_trade_price";

export interface BookUpdate {
    tokenId: string;
    type: BookEventType;
    snapshot: BookSnapshot;
}

export type BookListener = (update: BookUpdate) => void;

export class BookSimulator {
    private static readonly TICK_CENTS = 1;
    private static readonly MIN_CENTS = 1;
    private static readonly MAX_CENTS = 99;
    private static readonly LEVELS_PER_SIDE = 5;

    private readonly books: Map<string, BookSnapshot> = new Map();
    private readonly listeners: Set<BookListener> = new Set();
    private handle: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly intervalMs: number = 2000) {
        this.seed();
    }

    getSnapshot(tokenId: string): BookSnapshot | undefined {
        return this.books.get(tokenId);
    }

    subscribe(fn: BookListener): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    start(): void {
        if (this.handle) return;
        this.handle = setInterval(() => this.tick(), this.intervalMs);
    }

    stop(): void {
        if (this.handle) {
            clearInterval(this.handle);
            this.handle = null;
        }
    }

    private seed(): void {
        for (const m of SEED_MARKETS) {
            for (const t of m.tokens) {
                this.books.set(t.tokenId, {
                    tokenId: t.tokenId,
                    ...BookSimulator.buildBook(t.initialPriceCents),
                    updatedAt: Date.now(),
                });
            }
        }
    }

    private tick(): void {
        for (const [tokenId, snap] of this.books) {
            const next = this.drift(snap);
            this.books.set(tokenId, next);
            const type: BookEventType =
                next.lastTradePriceCents === snap.lastTradePriceCents ? "book" : "price_change";
            for (const listener of this.listeners) {
                listener({ tokenId, type, snapshot: next });
            }
        }
    }

    private drift(snapshot: BookSnapshot): BookSnapshot {
        const delta = Math.floor(Math.random() * 3) - 1;
        const newCenter = Math.max(
            BookSimulator.MIN_CENTS,
            Math.min(
                BookSimulator.MAX_CENTS,
                snapshot.lastTradePriceCents + delta * BookSimulator.TICK_CENTS,
            ),
        );
        return {
            tokenId: snapshot.tokenId,
            ...BookSimulator.buildBook(newCenter),
            updatedAt: Date.now(),
        };
    }

    private static buildBook(centerCents: number): Omit<BookSnapshot, "tokenId" | "updatedAt"> {
        const asks: BookLevel[] = [];
        const bids: BookLevel[] = [];
        for (let i = 0; i < BookSimulator.LEVELS_PER_SIDE; i++) {
            const askCents = Math.min(BookSimulator.MAX_CENTS, centerCents + i + 1);
            const bidCents = Math.max(BookSimulator.MIN_CENTS, centerCents - i);
            asks.push({
                price: askCents / 100,
                size: 500 + Math.floor(Math.random() * 4000),
            });
            bids.push({
                price: bidCents / 100,
                size: 500 + Math.floor(Math.random() * 4000),
            });
        }
        return { asks, bids, lastTradePriceCents: centerCents };
    }
}

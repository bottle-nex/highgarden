import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';
import type { PriceUpdatePayload } from '@solmarket/types';
import { Outcome } from '@solmarket/types';

// Key: `${marketId}:${outcome}` (e.g. "abc123:YES")
type BookKey = string;

export function makeBookKey(marketId: string, outcome: Outcome): BookKey {
    return `${marketId}:${outcome}`;
}

export interface TopOfBook {
    marketId: string;
    outcome: Outcome;
    bestBid: number;
    bestAsk: number;
    /** Backend-applied spread-adjusted quoted price */
    quotedPrice: number;
    updatedAt: number; // epoch ms — used as monotonic sequence guard
}

interface OrderBookState {
    tops: Record<BookKey, TopOfBook>;

    // Called by the rAF flusher only — not for direct use
    _flush: (batch: Map<BookKey, TopOfBook>) => void;
    // Clear a market's book (e.g. on WS disconnect)
    clear: (marketId: string) => void;
    clearAll: () => void;
}

export const useOrderBookStore = create<OrderBookState>()(
    devtools(
        subscribeWithSelector((set) => ({
            tops: {},

            _flush: (batch) =>
                set(
                    (s) => {
                        const tops = { ...s.tops };
                        let changed = false;
                        for (const [key, incoming] of batch) {
                            const prev = tops[key];
                            // Seq guard: drop stale frames
                            if (prev && incoming.updatedAt <= prev.updatedAt) continue;
                            tops[key] = incoming;
                            changed = true;
                        }
                        return changed ? { tops } : s;
                    },
                    false,
                    'book/flush',
                ),

            clear: (marketId) =>
                set(
                    (s) => {
                        const tops = { ...s.tops };
                        let changed = false;
                        for (const outcome of [Outcome.YES, Outcome.NO]) {
                            const key = makeBookKey(marketId, outcome);
                            if (key in tops) {
                                delete tops[key];
                                changed = true;
                            }
                        }
                        return changed ? { tops } : s;
                    },
                    false,
                    'book/clear',
                ),

            clearAll: () => set({ tops: {} }, false, 'book/clearAll'),
        })),
        { name: 'OrderBookStore' },
    ),
);

// ─── rAF Coalescer (module-level singleton) ───────────────────────────────────
// Accumulates incoming PRICE_UPDATE payloads and flushes once per animation
// frame. This caps renders to ~60/s regardless of WS message rate.

const pending = new Map<BookKey, TopOfBook>();
let rafId: number | null = null;

function flush() {
    rafId = null;
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    useOrderBookStore.getState()._flush(batch);
}

/** Call this from the stream layer for every PRICE_UPDATE message received. */
export function enqueueBookUpdate(payload: PriceUpdatePayload) {
    const key = makeBookKey(payload.marketId, payload.outcome);
    const incoming: TopOfBook = {
        marketId: payload.marketId,
        outcome: payload.outcome,
        bestBid: payload.bestBid,
        bestAsk: payload.bestAsk,
        quotedPrice: payload.quotedPrice,
        updatedAt: new Date(payload.updatedAt).getTime(),
    };
    // Within the pending batch, keep only the newest
    const existing = pending.get(key);
    if (!existing || incoming.updatedAt > existing.updatedAt) {
        pending.set(key, incoming);
    }
    if (rafId === null) {
        rafId = requestAnimationFrame(flush);
    }
}

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectTop = (marketId: string, outcome: Outcome) => (s: OrderBookState) =>
    s.tops[makeBookKey(marketId, outcome)];

export const selectBestAsk = (marketId: string, outcome: Outcome) => (s: OrderBookState) =>
    s.tops[makeBookKey(marketId, outcome)]?.bestAsk;

export const selectBestBid = (marketId: string, outcome: Outcome) => (s: OrderBookState) =>
    s.tops[makeBookKey(marketId, outcome)]?.bestBid;

export const selectQuotedPrice = (marketId: string, outcome: Outcome) => (s: OrderBookState) =>
    s.tops[makeBookKey(marketId, outcome)]?.quotedPrice;

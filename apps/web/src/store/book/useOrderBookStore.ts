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

// ─── Coalescer (module-level singleton) ───────────────────────────────────────
// Accumulates incoming PRICE_UPDATE payloads. Belt-and-suspenders:
// schedule both a requestAnimationFrame AND a setTimeout fallback so
// the queue still drains when the tab is backgrounded (RAF can be
// paused; setTimeout is throttled but still fires).

const FLUSH_FALLBACK_MS = 250;

const pending = new Map<BookKey, TopOfBook>();
let raf_id: number | null = null;
let timeout_id: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
    if (raf_id !== null) {
        cancelAnimationFrame(raf_id);
        raf_id = null;
    }
    if (timeout_id !== null) {
        clearTimeout(timeout_id);
        timeout_id = null;
    }
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    try {
        useOrderBookStore.getState()._flush(batch);
    } catch {
        // Swallow so a single bad payload doesn't poison the queue.
    }
}

function schedule(): void {
    if (raf_id === null) raf_id = requestAnimationFrame(flush);
    if (timeout_id === null) timeout_id = setTimeout(flush, FLUSH_FALLBACK_MS);
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
    schedule();
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

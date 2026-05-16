import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PriceUpdatePayload } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { makeBookKey } from './useOrderBookStore';

type BookKey = string;

export interface LastTrade {
    marketId: string;
    outcome: Outcome;
    price: number;
    updatedAt: number; // epoch ms
}

interface LastTradeState {
    byKey: Record<BookKey, LastTrade>;
    _flush: (batch: Map<BookKey, LastTrade>) => void;
    clear: (marketId: string) => void;
}

export const useLastTradeStore = create<LastTradeState>()(
    devtools(
        (set) => ({
            byKey: {},

            _flush: (batch) =>
                set(
                    (s) => {
                        const byKey = { ...s.byKey };
                        let changed = false;
                        for (const [key, next] of batch) {
                            const prev = byKey[key];
                            // Drop stale updates: keep the newer-ts entry.
                            if (prev && next.updatedAt <= prev.updatedAt) continue;
                            byKey[key] = next;
                            changed = true;
                        }
                        return changed ? { byKey } : s;
                    },
                    false,
                    'lastTrade/flush',
                ),

            clear: (marketId) =>
                set(
                    (s) => {
                        const byKey = { ...s.byKey };
                        let changed = false;
                        for (const outcome of [Outcome.YES, Outcome.NO]) {
                            const key = makeBookKey(marketId, outcome);
                            if (key in byKey) {
                                delete byKey[key];
                                changed = true;
                            }
                        }
                        return changed ? { byKey } : s;
                    },
                    false,
                    'lastTrade/clear',
                ),
        }),
        { name: 'LastTradeStore' },
    ),
);

// Coalescer. Matches the pattern in useOrderBookDepthStore: incoming
// WS events land in `pending` (latest payload per (market, outcome)
// wins), and a single flush per frame applies them. Belt-and-suspenders:
// schedule both a requestAnimationFrame AND a setTimeout fallback so the
// queue still drains when the tab is backgrounded (RAF can be paused;
// setTimeout is throttled but still fires).
const FLUSH_FALLBACK_MS = 250;

const pending = new Map<BookKey, LastTrade>();
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
        useLastTradeStore.getState()._flush(batch);
    } catch {
        // Swallow so a single bad payload doesn't poison the queue.
    }
}

function schedule(): void {
    if (raf_id === null) raf_id = requestAnimationFrame(flush);
    if (timeout_id === null) timeout_id = setTimeout(flush, FLUSH_FALLBACK_MS);
}

export function enqueueLastTradeUpdate(payload: PriceUpdatePayload): void {
    const key = makeBookKey(payload.marketId, payload.outcome);
    const ts = new Date(payload.updatedAt).getTime();
    const existing = pending.get(key);
    // Within a single frame, keep only the newest payload per key.
    if (existing && ts <= existing.updatedAt) return;
    pending.set(key, {
        marketId: payload.marketId,
        outcome: payload.outcome,
        // Last trade price is mid of best bid/ask.
        price: (payload.bestBid + payload.bestAsk) / 2,
        updatedAt: ts,
    });
    schedule();
}

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectLastTrade = (marketId: string, outcome: Outcome) => (s: LastTradeState) =>
    s.byKey[makeBookKey(marketId, outcome)];

export const selectLastTradePrice = (marketId: string, outcome: Outcome) => (s: LastTradeState) =>
    s.byKey[makeBookKey(marketId, outcome)]?.price;

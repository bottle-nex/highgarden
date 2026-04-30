import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import type { OrderBookSnapshotDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { makeBookKey } from './useOrderBookStore';

export const MAX_DEPTH_LEVELS = 25;

export interface DepthLevel {
    price: number;
    size: number;
}

export interface OrderBookDepth {
    marketId: string;
    outcome: Outcome;
    bids: DepthLevel[];
    asks: DepthLevel[];
    updatedAt: number;
}

export interface DepthChange {
    price: number;
    size: number;
    /** Polymarket convention: 'BUY' = bid side, 'SELL' = ask side. */
    side: 'BUY' | 'SELL';
}

type BookKey = string;

interface PendingEntry {
    snapshot?: OrderBookDepth;
    deltas: DepthChange[];
    marketId: string;
    outcome: Outcome;
    ts: number;
}

interface DepthState {
    byKey: Record<BookKey, OrderBookDepth>;

    hydrate: (snapshot: OrderBookSnapshotDTO) => void;
    _flush: (batch: Map<BookKey, PendingEntry>) => void;
    clear: (marketId: string) => void;
    clearAll: () => void;
}

export const useOrderBookDepthStore = create<DepthState>()(
    devtools(
        subscribeWithSelector((set) => ({
            byKey: {},

            hydrate: (snap) =>
                set(
                    (s) => {
                        const key = makeBookKey(snap.marketId, snap.outcome);
                        const next: OrderBookDepth = {
                            marketId: snap.marketId,
                            outcome: snap.outcome,
                            bids: snap.bids
                                .slice()
                                .sort((a, b) => b.price - a.price)
                                .slice(0, MAX_DEPTH_LEVELS),
                            asks: snap.asks
                                .slice()
                                .sort((a, b) => a.price - b.price)
                                .slice(0, MAX_DEPTH_LEVELS),
                            updatedAt: snap.updatedAt,
                        };
                        return { byKey: { ...s.byKey, [key]: next } };
                    },
                    false,
                    'depth/hydrate',
                ),

            _flush: (batch) =>
                set(
                    (s) => {
                        const byKey = { ...s.byKey };
                        let changed = false;
                        for (const [key, entry] of batch) {
                            const prev = byKey[key];

                            if (entry.snapshot) {
                                byKey[key] = entry.snapshot;
                                changed = true;
                                if (entry.deltas.length > 0) {
                                    byKey[key] = apply_changes(byKey[key]!, entry.deltas, entry.ts);
                                }
                                continue;
                            }

                            if (!prev) continue;
                            if (entry.deltas.length === 0) continue;
                            // Strict `<`: a hydrate written with the same wall-
                            // clock ms as an incoming Polymarket delta must not
                            // shadow that delta.
                            if (entry.ts < prev.updatedAt) continue;

                            byKey[key] = apply_changes(prev, entry.deltas, entry.ts);
                            changed = true;
                        }
                        return changed ? { byKey } : s;
                    },
                    false,
                    'depth/flush',
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
                    'depth/clear',
                ),

            clearAll: () => set({ byKey: {} }, false, 'depth/clearAll'),
        })),
        { name: 'OrderBookDepthStore' },
    ),
);

function apply_changes(prev: OrderBookDepth, changes: DepthChange[], ts: number): OrderBookDepth {
    const bid_map = new Map<number, number>();
    for (const lvl of prev.bids) bid_map.set(lvl.price, lvl.size);
    const ask_map = new Map<number, number>();
    for (const lvl of prev.asks) ask_map.set(lvl.price, lvl.size);

    for (const c of changes) {
        const target = c.side === 'BUY' ? bid_map : ask_map;
        if (!Number.isFinite(c.price)) continue;
        if (c.size <= 0) {
            target.delete(c.price);
        } else {
            target.set(c.price, c.size);
        }
    }

    const bids: DepthLevel[] = [];
    for (const [price, size] of bid_map) bids.push({ price, size });
    bids.sort((a, b) => b.price - a.price);

    const asks: DepthLevel[] = [];
    for (const [price, size] of ask_map) asks.push({ price, size });
    asks.sort((a, b) => a.price - b.price);

    return {
        marketId: prev.marketId,
        outcome: prev.outcome,
        bids: bids.slice(0, MAX_DEPTH_LEVELS),
        asks: asks.slice(0, MAX_DEPTH_LEVELS),
        updatedAt: ts,
    };
}

// ─── rAF coalescer ────────────────────────────────────────────────────────────

const pending = new Map<BookKey, PendingEntry>();
let raf_id: number | null = null;

function flush() {
    raf_id = null;
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    useOrderBookDepthStore.getState()._flush(batch);
}

function schedule() {
    if (raf_id === null) {
        raf_id = requestAnimationFrame(flush);
    }
}

export function enqueueDepthSnapshot(
    marketId: string,
    outcome: Outcome,
    bids: DepthLevel[],
    asks: DepthLevel[],
    ts_ms: number,
) {
    const key = makeBookKey(marketId, outcome);
    const sorted_bids = bids
        .slice()
        .sort((a, b) => b.price - a.price)
        .slice(0, MAX_DEPTH_LEVELS);
    const sorted_asks = asks
        .slice()
        .sort((a, b) => a.price - b.price)
        .slice(0, MAX_DEPTH_LEVELS);
    const snapshot: OrderBookDepth = {
        marketId,
        outcome,
        bids: sorted_bids,
        asks: sorted_asks,
        updatedAt: ts_ms,
    };
    pending.set(key, { snapshot, deltas: [], marketId, outcome, ts: ts_ms });
    schedule();
}

export function enqueueDepthChanges(
    marketId: string,
    outcome: Outcome,
    changes: DepthChange[],
    ts_ms: number,
) {
    const key = makeBookKey(marketId, outcome);
    const existing = pending.get(key);
    if (existing) {
        existing.deltas.push(...changes);
        if (ts_ms > existing.ts) existing.ts = ts_ms;
    } else {
        pending.set(key, {
            deltas: [...changes],
            marketId,
            outcome,
            ts: ts_ms,
        });
    }
    schedule();
}

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectDepth = (marketId: string, outcome: Outcome) => (s: DepthState) =>
    s.byKey[makeBookKey(marketId, outcome)];

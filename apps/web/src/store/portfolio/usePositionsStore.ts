import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Fill, FillDTO, PositionDTO } from '@solmarket/types';
import { Outcome, Side } from '@solmarket/types';

interface PositionsState {
    positions: PositionDTO[];
    loading: boolean;
    error: string | null;

    hydrate: (positions: PositionDTO[]) => void;
    setLoading: (v: boolean) => void;
    setError: (e: string | null) => void;
    /** Optimistic update applied right after a place_order tx confirms. */
    applyFill: (fill: Pick<Fill, 'marketId' | 'side' | 'outcome' | 'price' | 'size'>) => void;
    /** Optimistic update after a successful claim — zeroes the winning row. */
    applyClaim: (marketId: string, outcome: Outcome) => void;
    reset: () => void;
}

function update_avg(prev_avg: number, prev_qty: number, price: number, qty: number): number {
    const total = prev_qty + qty;
    if (total === 0) return 0;
    return (prev_avg * prev_qty + price * qty) / total;
}

export const usePositionsStore = create<PositionsState>()(
    devtools(
        (set) => ({
            positions: [],
            loading: false,
            error: null,

            hydrate: (positions) =>
                set({ positions, loading: false, error: null }, false, 'positions/hydrate'),
            setLoading: (loading) => set({ loading }, false, 'positions/setLoading'),
            setError: (error) => set({ error }, false, 'positions/setError'),

            applyFill: (fill) =>
                set(
                    (s) => {
                        const idx = s.positions.findIndex(
                            (p) => p.marketId === fill.marketId && p.outcome === fill.outcome,
                        );
                        const existing = idx >= 0 ? s.positions[idx]! : null;
                        const prev_shares = existing?.shares ?? 0;
                        const prev_avg = existing?.avgCostCents ?? 0;

                        let next_shares = prev_shares;
                        let next_avg = prev_avg;
                        if (fill.side === Side.BUY) {
                            next_avg = update_avg(prev_avg, prev_shares, fill.price, fill.size);
                            next_shares = prev_shares + fill.size;
                        } else {
                            next_shares = Math.max(0, prev_shares - fill.size);
                            if (next_shares === 0) next_avg = 0;
                        }

                        if (next_shares === 0 && existing && existing.status === 'OPEN') {
                            // Position fully closed — drop the row.
                            return {
                                positions: s.positions.filter((_, i) => i !== idx),
                            };
                        }

                        if (!existing) {
                            // Optimistic skeleton — server refresh will fill in market metadata.
                            return s;
                        }

                        const updated: PositionDTO = {
                            ...existing,
                            shares: next_shares,
                            avgCostCents: Math.round(next_avg),
                            tradedUsd: +((Math.round(next_avg) * next_shares) / 100).toFixed(2),
                            toWinUsd: next_shares,
                            valueUsd:
                                existing.currentPriceCents !== null
                                    ? +(
                                          (existing.currentPriceCents * next_shares) /
                                          100
                                      ).toFixed(2)
                                    : +((Math.round(next_avg) * next_shares) / 100).toFixed(2),
                        };
                        const next = s.positions.slice();
                        next[idx] = updated;
                        return { positions: next };
                    },
                    false,
                    'positions/applyFill',
                ),

            applyClaim: (marketId, outcome) =>
                set(
                    (s) => ({
                        positions: s.positions.filter(
                            (p) => !(p.marketId === marketId && p.outcome === outcome),
                        ),
                    }),
                    false,
                    'positions/applyClaim',
                ),

            reset: () => set({ positions: [], loading: false, error: null }, false, 'positions/reset'),
        }),
        { name: 'PositionsStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

// IMPORTANT: selectors must return stable references (or primitives). A
// selector that returns `arr.filter(...)` produces a new array each call,
// which Zustand sees as a state change and triggers an infinite render loop.
// For derived arrays, subscribe to `selectAllPositions` and compute with
// `useMemo` in the component.
export const selectAllPositions = (s: PositionsState) => s.positions;
export const selectPositionsLoading = (s: PositionsState) => s.loading;
export const selectShares =
    (marketId: string, outcome: Outcome) =>
    (s: PositionsState): number =>
        s.positions.find((p) => p.marketId === marketId && p.outcome === outcome)?.shares ?? 0;

// Re-export the FillDTO type for convenience so callers don't need a second import.
export type { FillDTO, PositionDTO };

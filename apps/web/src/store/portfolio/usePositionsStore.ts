import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Fill } from '@solmarket/types';
import { Outcome, Side } from '@solmarket/types';

// On-chain position per market, derived from Solana UserPosition PDAs
export interface UserPosition {
    marketId: string;
    yesShares: number;
    noShares: number;
    /** Average cost basis in USDC cents — computed client-side from fills */
    avgCostYes: number;
    avgCostNo: number;
    /** Unrealized P&L stub — caller fills in using live book prices */
    lastUpdatedAt: number; // epoch ms
}

interface PositionsState {
    byMarket: Record<string, UserPosition>;
    loading: boolean;
    error: string | null;

    // Actions
    hydrate: (positions: UserPosition[]) => void;
    setLoading: (v: boolean) => void;
    setError: (e: string | null) => void;
    /** Optimistic update: called immediately after a successful place_order tx */
    applyFill: (fill: Fill) => void;
    /** Called when a claim tx settles: removes shares */
    applyClaim: (marketId: string, outcome: Outcome, shares: number) => void;
    reset: () => void;
}

function updateAvgCost(prevAvg: number, prevShares: number, newPrice: number, newShares: number): number {
    const total = prevShares + newShares;
    if (total === 0) return 0;
    return (prevAvg * prevShares + newPrice * newShares) / total;
}

export const usePositionsStore = create<PositionsState>()(
    devtools(
        (set) => ({
            byMarket: {},
            loading: false,
            error: null,

            hydrate: (positions) => {
                const byMarket: Record<string, UserPosition> = {};
                for (const p of positions) byMarket[p.marketId] = p;
                set({ byMarket, loading: false, error: null }, false, 'positions/hydrate');
            },

            setLoading: (loading) => set({ loading }, false, 'positions/setLoading'),
            setError: (error) => set({ error }, false, 'positions/setError'),

            applyFill: (fill) =>
                set(
                    (s) => {
                        const prev = s.byMarket[fill.marketId] ?? {
                            marketId: fill.marketId,
                            yesShares: 0,
                            noShares: 0,
                            avgCostYes: 0,
                            avgCostNo: 0,
                            lastUpdatedAt: Date.now(),
                        };

                        let { yesShares, noShares, avgCostYes, avgCostNo } = prev;

                        if (fill.side === Side.BUY) {
                            if (fill.outcome === Outcome.YES) {
                                avgCostYes = updateAvgCost(avgCostYes, yesShares, fill.price, fill.size);
                                yesShares += fill.size;
                            } else {
                                avgCostNo = updateAvgCost(avgCostNo, noShares, fill.price, fill.size);
                                noShares += fill.size;
                            }
                        } else {
                            // SELL: reduce position
                            if (fill.outcome === Outcome.YES) {
                                yesShares = Math.max(0, yesShares - fill.size);
                            } else {
                                noShares = Math.max(0, noShares - fill.size);
                            }
                        }

                        return {
                            byMarket: {
                                ...s.byMarket,
                                [fill.marketId]: {
                                    ...prev,
                                    yesShares,
                                    noShares,
                                    avgCostYes,
                                    avgCostNo,
                                    lastUpdatedAt: Date.now(),
                                },
                            },
                        };
                    },
                    false,
                    'positions/applyFill',
                ),

            applyClaim: (marketId, outcome, shares) =>
                set(
                    (s) => {
                        const prev = s.byMarket[marketId];
                        if (!prev) return s;
                        return {
                            byMarket: {
                                ...s.byMarket,
                                [marketId]: {
                                    ...prev,
                                    yesShares: outcome === Outcome.YES ? Math.max(0, prev.yesShares - shares) : prev.yesShares,
                                    noShares: outcome === Outcome.NO ? Math.max(0, prev.noShares - shares) : prev.noShares,
                                    lastUpdatedAt: Date.now(),
                                },
                            },
                        };
                    },
                    false,
                    'positions/applyClaim',
                ),

            reset: () => set({ byMarket: {}, loading: false, error: null }, false, 'positions/reset'),
        }),
        { name: 'PositionsStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectPosition = (marketId: string) => (s: PositionsState) => s.byMarket[marketId];
export const selectHasPosition = (marketId: string) => (s: PositionsState) => {
    const p = s.byMarket[marketId];
    return !!p && (p.yesShares > 0 || p.noShares > 0);
};
export const selectAllPositions = (s: PositionsState) => Object.values(s.byMarket);

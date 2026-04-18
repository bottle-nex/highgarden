import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Fill } from '@solmarket/types';

interface FillsState {
    /** All fills for the current user, newest first */
    fills: Fill[];
    loading: boolean;
    error: string | null;

    // Actions
    hydrate: (fills: Fill[]) => void;
    /** Prepend a new fill (optimistic or from ORDER_FILLED WS event) */
    push: (fill: Fill) => void;
    setLoading: (v: boolean) => void;
    setError: (e: string | null) => void;
    reset: () => void;
}

export const useFillsStore = create<FillsState>()(
    devtools(
        (set) => ({
            fills: [],
            loading: false,
            error: null,

            hydrate: (fills) =>
                set(
                    {
                        fills: [...fills].sort(
                            (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
                        ),
                        loading: false,
                        error: null,
                    },
                    false,
                    'fills/hydrate',
                ),

            push: (fill) =>
                set(
                    (s) => {
                        // Deduplicate by id in case WS + REST both deliver it
                        if (s.fills.some((f) => f.id === fill.id)) return s;
                        return { fills: [fill, ...s.fills] };
                    },
                    false,
                    'fills/push',
                ),

            setLoading: (loading) => set({ loading }, false, 'fills/setLoading'),
            setError: (error) => set({ error }, false, 'fills/setError'),
            reset: () => set({ fills: [], loading: false, error: null }, false, 'fills/reset'),
        }),
        { name: 'FillsStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectFillsByMarket = (marketId: string) => (s: FillsState) =>
    s.fills.filter((f) => f.marketId === marketId);
export const selectAllFills = (s: FillsState) => s.fills;
export const selectFillsLoading = (s: FillsState) => s.loading;

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

interface StreamState {
    status: StreamStatus;
    /** Refcount per marketId: number of active subscribers */
    refCounts: Record<string, number>;
    /** Markets whose books are currently stale (WS disconnected) */
    staleMarkets: Set<string>;

    // Actions
    setStatus: (s: StreamStatus) => void;
    /**
     * Increment subscriber refcount for a market.
     * Returns true if this is the first subscriber (caller should send SUBSCRIBE_MARKET).
     */
    addSubscriber: (marketId: string) => boolean;
    /**
     * Decrement subscriber refcount for a market.
     * Returns true if refcount dropped to 0 (caller should send UNSUBSCRIBE_MARKET).
     */
    removeSubscriber: (marketId: string) => boolean;
    markStale: (marketId: string) => void;
    markFresh: (marketId: string) => void;
    markAllStale: () => void;
    reset: () => void;
}

export const useStreamStore = create<StreamState>()(
    devtools(
        subscribeWithSelector((set, get) => ({
            status: 'idle',
            refCounts: {},
            staleMarkets: new Set(),

            setStatus: (status) => set({ status }, false, 'stream/setStatus'),

            addSubscriber: (marketId) => {
                const prev = get().refCounts[marketId] ?? 0;
                set(
                    (s) => ({ refCounts: { ...s.refCounts, [marketId]: prev + 1 } }),
                    false,
                    'stream/addSubscriber',
                );
                return prev === 0; // first subscriber
            },

            removeSubscriber: (marketId) => {
                const prev = get().refCounts[marketId] ?? 0;
                const next = Math.max(0, prev - 1);
                set(
                    (s) => {
                        const refCounts = { ...s.refCounts };
                        if (next === 0) delete refCounts[marketId];
                        else refCounts[marketId] = next;
                        return { refCounts };
                    },
                    false,
                    'stream/removeSubscriber',
                );
                return next === 0; // last subscriber removed
            },

            markStale: (marketId) =>
                set(
                    (s) => ({ staleMarkets: new Set([...s.staleMarkets, marketId]) }),
                    false,
                    'stream/markStale',
                ),

            markFresh: (marketId) =>
                set(
                    (s) => {
                        const next = new Set(s.staleMarkets);
                        next.delete(marketId);
                        return { staleMarkets: next };
                    },
                    false,
                    'stream/markFresh',
                ),

            markAllStale: () =>
                set(
                    (s) => ({ staleMarkets: new Set(Object.keys(s.refCounts)) }),
                    false,
                    'stream/markAllStale',
                ),

            reset: () =>
                set({ status: 'idle', refCounts: {}, staleMarkets: new Set() }, false, 'stream/reset'),
        })),
        { name: 'StreamStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectStreamStatus = (s: StreamState) => s.status;
export const selectIsConnected = (s: StreamState) => s.status === 'open';
export const selectIsStale = (marketId: string) => (s: StreamState) => s.staleMarkets.has(marketId);
export const selectSubscribedMarkets = (s: StreamState) => Object.keys(s.refCounts);

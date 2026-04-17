import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Market, Listing, PolyMarket } from '@solmarket/types';
import { MarketStatus, Outcome } from '@solmarket/types';

// Shape we actually display: Market + its relations flattened
export interface MarketEntry {
    id: string;
    name: string;
    description: string;
    solanaMarketPda: string | null;
    polyMarketId: string;
    status: MarketStatus;
    winningOutcome: Outcome | null;
    endAt: Date;
    resolvedAt: Date | null;
    // From PolyMarket relation
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;
    // From Listing relation
    volume24hUsd: number | null;
    liquidityUsd: number | null;
}

function toMarketEntry(m: Market & { polymarket?: PolyMarket; listing?: Listing | null }): MarketEntry {
    return {
        id: m.id,
        name: m.name,
        description: m.description,
        solanaMarketPda: m.solanaMarketPda,
        polyMarketId: m.polyMarketId,
        status: m.status,
        winningOutcome: m.winningOutcome,
        endAt: m.endAt,
        resolvedAt: m.resolvedAt,
        yesTokenId: m.polymarket?.yesTokenId ?? '',
        noTokenId: m.polymarket?.noTokenId ?? '',
        tickSize: m.polymarket?.tickSize ?? '0.01',
        negRisk: m.polymarket?.negRisk ?? false,
        volume24hUsd: m.listing?.volume24hUsd ?? null,
        liquidityUsd: m.listing?.liquidityUsd ?? null,
    };
}

interface MarketsState {
    byId: Record<string, MarketEntry>;
    /** Stable ordered list of ids as returned from the server */
    ids: string[];
    fetchStatus: 'idle' | 'loading' | 'ready' | 'error';
    error: string | null;

    // Actions
    hydrate: (markets: (Market & { polymarket?: PolyMarket; listing?: Listing | null })[]) => void;
    setFetchStatus: (s: MarketsState['fetchStatus'], error?: string) => void;
    /** Called when a MARKET_STATUS_CHANGE WS event arrives */
    applyStatusChange: (marketId: string, status: MarketStatus) => void;
    /** Called when a MARKET_RESOLVED WS event arrives */
    applyResolution: (marketId: string, winningOutcome: Outcome, resolvedAt: Date) => void;
}

export const useMarketsStore = create<MarketsState>()(
    devtools(
        (set) => ({
            byId: {},
            ids: [],
            fetchStatus: 'idle',
            error: null,

            hydrate: (markets) => {
                const byId: Record<string, MarketEntry> = {};
                const ids: string[] = [];
                for (const m of markets) {
                    byId[m.id] = toMarketEntry(m);
                    ids.push(m.id);
                }
                set({ byId, ids, fetchStatus: 'ready', error: null }, false, 'markets/hydrate');
            },

            setFetchStatus: (fetchStatus, error) =>
                set({ fetchStatus, error: error ?? null }, false, 'markets/setFetchStatus'),

            applyStatusChange: (marketId, status) =>
                set(
                    (s) => {
                        const prev = s.byId[marketId];
                        if (!prev || prev.status === status) return s;
                        return { byId: { ...s.byId, [marketId]: { ...prev, status } } };
                    },
                    false,
                    'markets/applyStatusChange',
                ),

            applyResolution: (marketId, winningOutcome, resolvedAt) =>
                set(
                    (s) => {
                        const prev = s.byId[marketId];
                        if (!prev) return s;
                        return {
                            byId: {
                                ...s.byId,
                                [marketId]: {
                                    ...prev,
                                    status: MarketStatus.RESOLVED,
                                    winningOutcome,
                                    resolvedAt,
                                },
                            },
                        };
                    },
                    false,
                    'markets/applyResolution',
                ),
        }),
        { name: 'MarketsStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectMarketById = (id: string) => (s: MarketsState) => s.byId[id];
export const selectAllMarkets = (s: MarketsState) => s.ids.map((id) => s.byId[id]).filter(Boolean);
export const selectOpenMarkets = (s: MarketsState) =>
    s.ids.map((id) => s.byId[id]).filter((m) => m?.status === MarketStatus.OPEN);
export const selectMarketsReady = (s: MarketsState) => s.fetchStatus === 'ready';

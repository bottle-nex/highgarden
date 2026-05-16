'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outcome, type OrderBookStatus } from '@solmarket/types';
import {
    MAX_DEPTH_LEVELS,
    selectDepth,
    useOrderBookDepthStore,
    type DepthLevel,
} from '@/store/book/useOrderBookDepthStore';
import { enqueueBookUpdate } from '@/store/book/useOrderBookStore';
import { fetch_market_orderbook } from '@/lib/api/markets';
import { SocketEventHandlers } from './socket-event-handlers';

export interface UseOrderBookResult {
    bids: DepthLevel[];
    asks: DepthLevel[];
    bestBid: number | null;
    bestAsk: number | null;
    spread: number | null;
    mid: number | null;
    cumulativeBids: number[];
    cumulativeAsks: number[];
    cumulativeBidsUsd: number[];
    cumulativeAsksUsd: number[];
    isHydrated: boolean;
    status: OrderBookStatus | null;
    refetch: () => void;
    isRefetching: boolean;
}

const EMPTY: DepthLevel[] = [];

export function useOrderBook(
    marketId: string | null | undefined,
    outcome: Outcome,
    /** When true (slot endAt has passed or the market is RESOLVED) we
     *  skip both the initial REST seed and the safety-net poller. The
     *  book is dead — no orders, no point burning network on it. */
    frozen: boolean = false,
): UseOrderBookResult {
    const depth = useOrderBookDepthStore(
        marketId ? selectDepth(marketId, outcome) : () => undefined,
    );
    const hydrating = useRef<Set<string>>(new Set());
    const [status, set_status] = useState<OrderBookStatus | null>(null);
    const [is_refetching, set_is_refetching] = useState(false);

    const hydrate_book = useCallback(async (): Promise<void> => {
        if (!marketId) return;
        if (frozen) return;
        const key = `${marketId}:${outcome}`;
        // Dedupe truly-concurrent calls (e.g. user spamming the refresh
        // button). NOTE: do NOT use a per-call cancellation flag to gate the
        // global-store write — under React 18 StrictMode the first effect's
        // cancel flag is set before its fetch resolves, which would drop a
        // perfectly-good snapshot and leave the orderbook stuck on "Loading".
        if (hydrating.current.has(key)) return;
        hydrating.current.add(key);
        set_is_refetching(true);
        try {
            const snap = await fetch_market_orderbook(marketId, outcome, MAX_DEPTH_LEVELS);
            if (!snap) return;
            set_status(snap.status);
            useOrderBookDepthStore.getState().hydrate(snap);
            SocketEventHandlers.seed_book(snap.tokenId, snap.bids, snap.asks);
            if (snap.bestBid !== null && snap.bestAsk !== null) {
                enqueueBookUpdate({
                    marketId: snap.marketId,
                    outcome: snap.outcome,
                    bestBid: snap.bestBid,
                    bestAsk: snap.bestAsk,
                    quotedPrice: snap.bestAsk,
                    updatedAt: new Date(snap.updatedAt).toISOString(),
                });
            }
        } finally {
            hydrating.current.delete(key);
            set_is_refetching(false);
        }
    }, [marketId, outcome, frozen]);

    useEffect(() => {
        void hydrate_book();
    }, [hydrate_book]);

    // WS is the primary update path:
    //   • On SUBSCRIBE the server pushes an initial book snapshot back over
    //     the same socket (fetched directly from Polymarket's CLOB), so the
    //     client never waits on the mirror for first paint.
    //   • Subsequent price_change / book events stream live via the mirror
    //     → redis → ws fan-out and apply through SocketEventHandlers.
    //
    // This interval is a sparse safety net — only catches the rare case
    // where a price_change packet is dropped between mirror and client.
    // 15s is long enough to stay out of the WS's way but short enough that
    // a missed tick doesn't leave a 5-min crypto market visibly stale.
    useEffect(() => {
        if (!marketId || frozen) return;
        const handle = setInterval(() => {
            void hydrate_book();
        }, 15_000);
        return () => clearInterval(handle);
    }, [marketId, hydrate_book, frozen]);

    const refetch = useCallback((): void => {
        void hydrate_book();
    }, [hydrate_book]);

    return useMemo(() => {
        const bids = depth?.bids ?? EMPTY;
        const asks = depth?.asks ?? EMPTY;
        const bestBid = bids.length > 0 ? bids[0]!.price : null;
        const bestAsk = asks.length > 0 ? asks[0]!.price : null;
        const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
        const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

        const cumulativeBids: number[] = [];
        const cumulativeBidsUsd: number[] = [];
        let bid_total = 0;
        let bid_total_usd = 0;
        for (const b of bids) {
            bid_total += b.size;
            bid_total_usd += b.price * b.size;
            cumulativeBids.push(bid_total);
            cumulativeBidsUsd.push(bid_total_usd);
        }
        const cumulativeAsks: number[] = [];
        const cumulativeAsksUsd: number[] = [];
        let ask_total = 0;
        let ask_total_usd = 0;
        for (const a of asks) {
            ask_total += a.size;
            ask_total_usd += a.price * a.size;
            cumulativeAsks.push(ask_total);
            cumulativeAsksUsd.push(ask_total_usd);
        }

        return {
            bids,
            asks,
            bestBid,
            bestAsk,
            spread,
            mid,
            cumulativeBids,
            cumulativeAsks,
            cumulativeBidsUsd,
            cumulativeAsksUsd,
            isHydrated: depth !== undefined,
            status,
            refetch,
            isRefetching: is_refetching,
        };
    }, [depth, status, refetch, is_refetching]);
}

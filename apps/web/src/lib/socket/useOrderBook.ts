'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    isHydrated: boolean;
    status: OrderBookStatus | null;
}

const EMPTY: DepthLevel[] = [];

export function useOrderBook(
    marketId: string | null | undefined,
    outcome: Outcome,
): UseOrderBookResult {
    const depth = useOrderBookDepthStore(
        marketId ? selectDepth(marketId, outcome) : () => undefined,
    );
    const hydrating = useRef<Set<string>>(new Set());
    const [status, set_status] = useState<OrderBookStatus | null>(null);

    useEffect(() => {
        if (!marketId) return;
        const key = `${marketId}:${outcome}`;
        if (hydrating.current.has(key)) return;
        hydrating.current.add(key);

        let cancelled = false;
        fetch_market_orderbook(marketId, outcome, MAX_DEPTH_LEVELS)
            .then((snap) => {
                if (cancelled || !snap) return;
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
            })
            .finally(() => {
                hydrating.current.delete(key);
            });

        return () => {
            cancelled = true;
        };
    }, [marketId, outcome]);

    return useMemo(() => {
        const bids = depth?.bids ?? EMPTY;
        const asks = depth?.asks ?? EMPTY;
        const bestBid = bids.length > 0 ? bids[0]!.price : null;
        const bestAsk = asks.length > 0 ? asks[0]!.price : null;
        const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
        const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

        const cumulativeBids: number[] = [];
        let bid_total = 0;
        for (const b of bids) {
            bid_total += b.size;
            cumulativeBids.push(bid_total);
        }
        const cumulativeAsks: number[] = [];
        let ask_total = 0;
        for (const a of asks) {
            ask_total += a.size;
            cumulativeAsks.push(ask_total);
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
            isHydrated: depth !== undefined,
            status,
        };
    }, [depth, status]);
}

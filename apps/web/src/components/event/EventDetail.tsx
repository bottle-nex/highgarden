'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { fetch_market_by_id, fetch_market_orderbook } from '@/lib/api/markets';
import { useMarketsStore } from '@/store/markets/useMarketsStore';
import { useMarketStream } from '@/lib/socket/useWebSocket';
import { useSubscribeEventHandlers } from '@/lib/socket/useSubscribeEventHandlers';
import { enqueueBookUpdate } from '@/store/book/useOrderBookStore';
import { SocketEventHandlers } from '@/lib/socket/socket-event-handlers';

import EventTitleBlock from './EventTitleBlock';
import ProbabilityHeadline from './ProbabilityHeadline';
import EventPriceChart from './EventPriceChart';
import EventOrderBook from './EventOrderBook';
import EventTradePanel from './EventTradePanel';
import EventTabs from './EventTabs';
import EventRelatedMarkets from './EventRelatedMarkets';
import EventBreadcrumb from './EventBreadcrumb';
import DashboardNavbar from '../dashboard/DashboardNavbar';

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_close_label(iso: string): string {
    const d = new Date(iso);
    return `CLOSES ${d
        .toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        .toUpperCase()}`;
}

type State =
    | { status: 'loading' }
    | { status: 'not_found' }
    | { status: 'ready'; market: MarketDTO };

export default function EventDetail({ id }: { id: string }) {
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetch_market_by_id(id).then((m) => {
            if (cancelled) return;
            if (m) {
                useMarketsStore.getState().upsert_one(m);
                set_state({ status: 'ready', market: m });
            } else {
                set_state({ status: 'not_found' });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [id]);

    return (
        <div data-lenis-prevent className="min-h-screen w-full bg-dark-alpha text-white/80">
            <DashboardNavbar />

            <main className="mx-auto w-full max-w-360 px-6 lg:px-8 py-10 lg:py-12">
                {state.status === 'loading' && <Frame>Loading market…</Frame>}
                {state.status === 'not_found' && (
                    <Frame>
                        Market not found. It may not be approved yet, or the link is wrong.
                    </Frame>
                )}
                {state.status === 'ready' && <Body market={state.market} />}
            </main>
        </div>
    );
}

function Body({ market }: { market: MarketDTO }) {
    useSubscribeEventHandlers();
    useMarketStream(market.id);

    const [selected_outcome, set_selected_outcome] = useState<Outcome>(Outcome.YES);
    const [delta24h, set_delta24h] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const seed = (outcome: Outcome) =>
            fetch_market_orderbook(market.id, outcome, 25).then((snap) => {
                if (cancelled || !snap) return;
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
            });
        seed(Outcome.YES);
        seed(Outcome.NO);
        return () => {
            cancelled = true;
        };
    }, [market.id]);

    const handle_chart_loaded = useCallback((_latest: number, delta: number | null) => {
        set_delta24h(delta);
    }, []);

    return (
        <div className="space-y-8 [overflow-anchor:none]">
            <EventBreadcrumb title={market.name} />
            <EventTitleBlock market={market} />
            <ProbabilityHeadline marketId={market.id} delta24hPct={delta24h} />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 xl:gap-8">
                <div className="min-w-0 space-y-6">
                    <EventPriceChart
                        marketId={market.id}
                        volumeLabel={format_usd(market.volume24hUsd)}
                        closeLabel={format_close_label(market.endAt)}
                        onLoaded={handle_chart_loaded}
                    />
                    <EventOrderBook
                        marketId={market.id}
                        selectedOutcome={selected_outcome}
                        onOutcomeChange={set_selected_outcome}
                    />
                    <EventTabs description={market.description} />
                </div>
                <div>
                    <EventTradePanel
                        market={market}
                        selectedOutcome={selected_outcome}
                        onOutcomeChange={set_selected_outcome}
                    />
                </div>
            </div>

            <EventRelatedMarkets excludeId={market.id} />
        </div>
    );
}

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div className="border border-dashed border-white/10 rounded-[6px] py-20 text-center text-sm text-white/45">
            {children}
        </div>
    );
}

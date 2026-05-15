'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { HiArrowLeft } from 'react-icons/hi2';
import type { MarketDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { fetch_market_by_id, fetch_market_orderbook } from '@/lib/api/markets';
import { selectMarketById, useMarketsStore } from '@/store/markets/useMarketsStore';
import { useMarketStream } from '@/lib/socket/useWebSocket';
import { useSubscribeEventHandlers } from '@/lib/socket/useSubscribeEventHandlers';
import { enqueueBookUpdate } from '@/store/book/useOrderBookStore';
import { SocketEventHandlers } from '@/lib/socket/socket-event-handlers';

import EventTitleBlock from './EventTitleBlock';
import EventPriceChart from './EventPriceChart';
import EventOrderBook from './EventOrderBook';
import EventTradePanel from './EventTradePanel';
import EventTabs from './EventTabs';
import EventNews from './EventNews';
import EventRelatedMarkets from './EventRelatedMarkets';
import EventGoLiveBanner from './EventGoLiveBanner';
import LiveAssetPrice from './LiveAssetPrice';
import MarketComments from '../market/comments/MarketComments';

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_close_label(iso: string): string {
    const d = new Date(iso);
    return `Closes ${d
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
        // Reset to 'loading' on every id change. This unmounts Body
        // (and with it useMarketStream's effect), which runs the WS
        // UNSUBSCRIBE for the OLD market's tokens before we subscribe
        // the new ones. Without this reset, navigation between two
        // /event/:id pages would just rerender Body with the new
        // market prop — and during the in-flight fetch the WS stays
        // subscribed to the previous market, so the new market's
        // book events never get routed and the orderbook freezes.
        set_state({ status: 'loading' });
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
        <main
            data-lenis-prevent
            className="mx-auto w-full max-w-380 px-3 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-12"
        >
            {state.status === 'loading' && <Frame>Loading market…</Frame>}
            {state.status === 'not_found' && (
                <Frame>Market not found. It may not be approved yet, or the link is wrong.</Frame>
            )}
            {state.status === 'ready' && (
                // `key` forces a full remount when the market id changes —
                // belt-and-suspenders with the state reset above so every
                // child hook (useMarketStream, useOrderBook, the trade
                // panel) starts from a clean slate on navigation.
                <Body key={state.market.id} market={state.market} />
            )}
        </main>
    );
}

function Body({ market }: { market: MarketDTO }) {
    useSubscribeEventHandlers();
    useMarketStream(market.id);

    // Subscribe to the live store entry. The initial fetch seeds it; the
    // WS `MARKET_RESOLVED` handler flips status + winningOutcome when the
    // resolver lands on-chain — that's the signal that drives the trade
    // panel from Buy/Sell to "Claim payout" without a page reload.
    const live = useMarketsStore(selectMarketById(market.id));
    const live_market = useMemo<MarketDTO>(() => {
        if (!live) return market;
        return {
            ...market,
            status: live.status,
            winningOutcome: live.winningOutcome,
            resolvedAt: live.resolvedAt?.toISOString() ?? market.resolvedAt,
        };
    }, [market, live]);

    const [delta24h, set_delta24h] = useState<number | null>(null);
    const [is_title_stuck, set_is_title_stuck] = useState(false);
    const sticky_title_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = sticky_title_ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => set_is_title_stuck(entry.intersectionRatio < 1),
            { rootMargin: '-65px 0px 0px 0px', threshold: [1] },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

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
        <div className="space-y-6 [overflow-anchor:none]">
            <Link
                href="/dashboard"
                className="group inline-flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white/85 transition-colors"
            >
                <HiArrowLeft className="text-[13px] transition-transform duration-200 group-hover:-translate-x-0.5" />
                <span>Back to dashboard</span>
            </Link>
            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6 xl:gap-3">
                <div className="contents lg:block lg:min-w-0 lg:space-y-5">
                    <div
                        ref={sticky_title_ref}
                        className="order-1 lg:order-0 lg:sticky lg:top-16 lg:z-20 lg:-mx-2 lg:px-2 lg:py-3 lg:bg-dark-alpha/90 lg:backdrop-blur-sm"
                    >
                        <EventTitleBlock market={market} is_stuck={is_title_stuck} />
                    </div>
                    <div className="contents xl:grid xl:grid-cols-[1fr_320px] xl:gap-3">
                        <div className="order-2 lg:order-0 min-w-0">
                            {live_market.fastSeriesKey && (
                                <LiveAssetPrice seriesKey={live_market.fastSeriesKey} />
                            )}
                            <EventPriceChart
                                marketId={market.id}
                                volumeLabel={format_usd(market.volume24hUsd)}
                                closeLabel={format_close_label(market.endAt)}
                                delta24hPct={delta24h}
                                onLoaded={handle_chart_loaded}
                                fastSeriesKey={live_market.fastSeriesKey}
                            />
                        </div>
                        <div className="order-4 lg:order-0">
                            <EventOrderBook marketId={market.id} />
                        </div>
                    </div>
                    <div className="order-6 lg:order-0">
                        <EventTabs description={market.description} tags={market.tags} />
                    </div>
                    <div className="order-7 lg:order-0">
                        <MarketComments market_id={market.id} />
                    </div>
                </div>
                <div className="contents lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-24 lg:h-[calc(100vh-6rem)]">
                    <div className="order-3 lg:order-0 space-y-3">
                        <EventGoLiveBanner market={live_market} />
                        <EventTradePanel market={live_market} />
                    </div>
                    <div className="custom-scrollbar order-5 lg:order-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                        <EventNews marketId={market.id} />
                    </div>
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

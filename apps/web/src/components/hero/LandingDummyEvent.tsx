'use client';

import { JSX, useMemo } from 'react';
import { MarketStatus, type MarketDTO } from '@solmarket/types';
import EventTitleBlock from '@/components/event/EventTitleBlock';
import EventOrderBook from '@/components/event/EventOrderBook';
import EventTradePanel from '@/components/event/EventTradePanel';
import LandingDummyPriceChart from './LandingDummyPriceChart';
import { LANDING_DEMO_MARKET_ID, useLandingDummyMarketFeed } from './useLandingDummyMarketFeed';

function build_dummy_market(): MarketDTO {
    const close = new Date('2027-12-31T20:00:00Z').toISOString();
    return {
        id: LANDING_DEMO_MARKET_ID,
        name: 'Will the U.S. invade Iran before 2027?',
        description:
            'This market will resolve to "Yes" if the United States commences a military offensive intended to establish control of Iranian territory before 31 Dec 2026.',
        endAt: close,
        status: MarketStatus.OPEN,
        polyMarketId: 'landing-demo',
        yesTokenId: 'landing-demo-yes',
        noTokenId: 'landing-demo-no',
        tickSize: '0.01',
        negRisk: false,
        // null disables the trade panel's submit via the existing
        // `disable_reason` path — no real trading API can be hit.
        solanaMarketPda: null,
        volume24hUsd: 484_240_000,
        liquidityUsd: null,
        imageUrl: null,
        eventId: null,
        eventSlug: null,
        kind: 'STANDARD',
        fastSeriesKey: null,
        winningOutcome: null,
        resolvedAt: null,
        tags: ['Politics', 'Geopolitics', 'World'],
    };
}

export default function LandingDummyEvent(): JSX.Element {
    useLandingDummyMarketFeed();
    const market = useMemo<MarketDTO>(() => build_dummy_market(), []);

    return (
        <div
            aria-hidden
            className="pointer-events-none select-none w-full rounded-2xl border border-white/10 bg-dark-alpha backdrop-blur-sm overflow-hidden text-white/80"
        >
            <div className="px-5 lg:px-6 py-6 lg:py-7">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
                    <div className="min-w-0 space-y-4">
                        <EventTitleBlock market={market} />
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-3">
                            <LandingDummyPriceChart
                                volumeLabel="$484.2M"
                                closeLabel="Closes 31 DEC 2026"
                            />
                            <EventOrderBook marketId={LANDING_DEMO_MARKET_ID} />
                        </div>
                    </div>
                    <div>
                        <EventTradePanel market={market} />
                    </div>
                </div>
            </div>
        </div>
    );
}

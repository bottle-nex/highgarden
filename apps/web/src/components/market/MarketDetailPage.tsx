'use client';
import { JSX } from 'react';
import Link from 'next/link';
import type { MarketDetail } from '@/utils/constants';
import { getRelatedMarkets } from '@/utils/constants';
import MarketHeader from './MarketHeader';
import TradingPanel from './TradingPanel';
import PriceChart from './PriceChart';
import OutcomesList from './OutcomesList';
import MarketRules from './MarketRules';
import MarketActivity from './MarketActivity';
import RelatedMarkets from './RelatedMarkets';
import s from './market.module.css';

interface Props {
    market: MarketDetail;
}

export default function MarketDetailPage({ market }: Props): JSX.Element {
    const related = getRelatedMarkets(market.relatedMarketIds);

    return (
        <div className={s.page}>
            <div className={s.container}>
                <nav className={s.breadcrumb}>
                    <Link href="/dashboard" className={s.breadcrumbLink}>
                        Dashboard
                    </Link>
                    <span className={s.breadcrumbSep}>/</span>
                    <span className={s.breadcrumbCurrent}>{market.category}</span>
                    <span className={s.breadcrumbSep}>/</span>
                    <span className={s.breadcrumbCurrent}>{market.title}</span>
                </nav>

                <MarketHeader market={market} />

                <div className={s.layout} style={{ marginTop: 28 }}>
                    <div className={s.mainCol}>
                        <PriceChart data={market.priceHistory} />
                        <OutcomesList outcomes={market.outcomes} type={market.type} />
                        <MarketRules rules={market.rules} />
                        <MarketActivity trades={market.recentTrades} />
                        <RelatedMarkets markets={related} />
                    </div>

                    <TradingPanel market={market} />
                </div>
            </div>
        </div>
    );
}

import { JSX } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import LiveFeaturedMarket from '@/components/dashboard/LiveFeaturedMarket';
import LiveMarketGrid from '@/components/dashboard/LiveMarketGrid';
import BreakingNewsList from '@/components/dashboard/BreakingNewsList';
import HotTopicsList from '@/components/dashboard/HotTopicsList';
import StakingSection from '@/components/dashboard/StakingSection';
import {
    breakingNews,
    hotTopics,
    yesNoMarkets,
    multiCandidateMarkets,
    multiOptionMarkets,
} from '@/utils/constants';

export default function DashboardPage(): JSX.Element {
    return (
        <DashboardLayout>
            <div className="space-y-14">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 xl:gap-16">
                    <div className="min-w-0 space-y-10">
                        <LiveFeaturedMarket />
                    </div>

                    <aside className="space-y-14">
                        <BreakingNewsList items={breakingNews} />
                        <HotTopicsList topics={hotTopics} />
                    </aside>
                </div>

                <StakingSection
                    yesNoMarkets={yesNoMarkets}
                    multiCandidateMarkets={multiCandidateMarkets}
                    multiOptionMarkets={multiOptionMarkets}
                />

                <LiveMarketGrid />

                <div className="flex items-center justify-center pt-6">
                    <button
                        type="button"
                        className="group relative h-11 px-8 rounded-md border border-white/15 hover:bg-white/5 font-mono text-[10px] tracking-[0.3em] uppercase text-white/60 hover:text-white/85 transition-colors cursor-pointer"
                    >
                        EXPLORE ALL MARKETS →
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
}

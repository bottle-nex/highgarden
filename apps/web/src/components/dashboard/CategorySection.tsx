'use client';
import { JSX } from 'react';
import LiveFeaturedMarket from './LiveFeaturedMarket';
import LiveMarketGrid from './LiveMarketGrid';
import LiveStakingSection from './LiveStakingSection';
import BreakingNewsList from './BreakingNewsList';
import HotTopicsList from './HotTopicsList';
import { hotTopics } from '@/utils/constants';
import { useCategoryStore } from '@/store/ui/useCategoryStore';
import type { Category } from '@/store/ui/useCategoryStore';

export default function CategorySection(): JSX.Element {
    const active = useCategoryStore((s) => s.activeCategory);

    if (active === 'Trending') return <TrendingSection />;
    return <PlaceholderSection category={active} />;
}

function TrendingSection(): JSX.Element {
    return (
        <div className="space-y-14">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-12 xl:gap-12 h-140 overflow-hidden">
                <div className="min-w-0 min-h-0 flex flex-col">
                    <LiveFeaturedMarket />
                </div>

                <aside className="flex flex-col h-full justify-between min-h-0 py-1">
                    <BreakingNewsList limit={3} />
                    <HotTopicsList topics={hotTopics.slice(0, 4)} />
                </aside>
            </div>

            <LiveStakingSection />

            <LiveMarketGrid />

            <div className="flex items-center justify-center pt-6">
                <button
                    type="button"
                    className="group relative h-11 px-8 rounded-md border border-white/15 hover:bg-white/5  text-[10px] tracking-[0.3em] uppercase text-white/60 hover:text-white/85 transition-colors cursor-pointer"
                >
                    EXPLORE ALL MARKETS →
                </button>
            </div>
        </div>
    );
}

function PlaceholderSection({ category }: { category: Category }): JSX.Element {
    return (
        <div className="border border-dashed border-white/10 rounded-md py-24 text-center">
            <div className=" text-[10px] tracking-[0.3em] uppercase text-white/35">{category}</div>
            <div className="mt-3 text-sm text-white/55">
                No {category.toLowerCase()} markets to show yet.
            </div>
        </div>
    );
}

'use client';
import { JSX, useEffect, useState } from 'react';
import LiveFeaturedMarket from './LiveFeaturedMarket';
import LiveMarketGrid from './LiveMarketGrid';
import LiveStakingSection from './LiveStakingSection';
import BreakingNewsList from './BreakingNewsList';
import HotTopicsList from './HotTopicsList';
import { hotTopics, type HotTopic } from '@/utils/constants';
import { useCategoryStore } from '@/store/ui/useCategoryStore';
import type { Category } from '@/store/ui/useCategoryStore';
import { is_tag_category } from '@/utils/category-tags';

export default function CategorySection(): JSX.Element {
    const active = useCategoryStore((s) => s.activeCategory);

    if (active === 'Trending') return <TrendingSection />;
    if (is_tag_category(active)) return <TagFilteredSection category={active} />;
    // Breaking / New / Mentions aren't real tag filters yet.
    return <PlaceholderSection category={active} />;
}

function TrendingSection(): JSX.Element {
    // Hold topics back for one paint so the hot-topics list shows its skeleton
    // alongside the other panels' loading states instead of flashing in alone.
    const [topics, set_topics] = useState<HotTopic[] | null>(null);
    useEffect(() => {
        const id = requestAnimationFrame(() => set_topics(hotTopics.slice(0, 4)));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <div className="space-y-8 sm:space-y-12 lg:space-y-14">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 sm:gap-8 lg:gap-12 xl:gap-8 lg:h-140 lg:overflow-hidden">
                <div className="min-w-0 flex flex-col min-h-80 lg:min-h-0">
                    <LiveFeaturedMarket />
                </div>

                <aside className="flex flex-col gap-6 sm:gap-8 lg:h-full lg:justify-between lg:min-h-0 lg:gap-0 lg:py-1">
                    <BreakingNewsList limit={3} />
                    <HotTopicsList topics={topics} />
                </aside>
            </div>

            <LiveStakingSection />

            <LiveMarketGrid excludeFeatured />

            {/* <div className="flex items-center justify-center pt-6">
                <button
                    type="button"
                    className="group relative h-11 px-8 rounded-md border border-white/15 hover:bg-white/5  text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-white/60 hover:text-white/85 transition-colors cursor-pointer"
                >
                    EXPLORE ALL MARKETS →
                </button>
            </div> */}
        </div>
    );
}

function TagFilteredSection({ category }: { category: Category }): JSX.Element {
    return (
        <div className="space-y-8">
            {/* `key` forces a fresh mount when the category changes so the
                grid drops back to its loading state instead of flashing the
                previous category's results. */}
            <LiveMarketGrid key={category} category={category} />
        </div>
    );
}

function PlaceholderSection({ category }: { category: Category }): JSX.Element {
    return (
        <div className="border border-dashed border-white/10 rounded-md py-12 sm:py-16 lg:py-24 text-center px-4">
            <div className=" text-[10px] tracking-[0.3em] uppercase text-white/35">{category}</div>
            <div className="mt-3 text-xs sm:text-sm text-white/55">
                No {category.toLowerCase()} markets to show yet.
            </div>
        </div>
    );
}

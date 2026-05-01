import { JSX } from 'react';
import { cn } from '@/lib/utils';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
import type { BreakingNewsItem } from '@/utils/constants';
import SectionHeading from './SectionHeading';

export default function BreakingNewsList({ items }: { items: BreakingNewsItem[] }): JSX.Element {
    return (
        <section className="flex flex-col min-h-0 pt-1">
            <div className="px-2">
                <SectionHeading title="Breaking News" subtitle="Live Feed" />
            </div>
            <ul className="flex-1 min-h-0 overflow-hidden">
                {items.map((item, i) => {
                    const isUp = item.trend === 'up';
                    const Icon = isUp ? HiArrowTrendingUp : HiArrowTrendingDown;
                    return (
                        <li
                            key={item.id}
                            className="py-3 flex items-center gap-3 hover:bg-white/3 transition-colors cursor-pointer group px-2 rounded-sm"
                        >
                            <span className="text-[15px] tabular-nums text-white/35 shrink-0">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            <p className="flex-1 min-w-0 text-[13px] text-white/70 leading-snug line-clamp-2 group-hover:text-white/85 transition-colors">
                                {item.title}
                            </p>
                            <div
                                className={cn(
                                    'flex items-center gap-1 text-[16px] tabular-nums shrink-0',
                                    isUp ? 'text-green-600/80' : 'text-red-600/80',
                                )}
                            >
                                <Icon className="size-3" />
                                {isUp ? '+' : ''}
                                {item.delta}%
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

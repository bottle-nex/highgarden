import { JSX } from 'react';
import { cn } from '@/lib/utils';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
import type { BreakingNewsItem } from '@/utils/constants';
import SectionHeading from './SectionHeading';

export default function BreakingNewsList({ items }: { items: BreakingNewsItem[] }): JSX.Element {
    return (
        <section>
            <SectionHeading title="BREAKING" subtitle="LIVE FEED" />
            <div className="border border-white/10 bg-neutral-950 divide-y divide-white/8 rounded-[6px] overflow-hidden">
                {items.map((item) => {
                    const isUp = item.trend === 'up';
                    const Icon = isUp ? HiArrowTrendingUp : HiArrowTrendingDown;
                    return (
                        <div
                            key={item.id}
                            className="px-5 py-3 hover:bg-white/3 transition-colors cursor-pointer group"
                        >
                            <div className="flex items-center justify-between text-[10px] tracking-[0.22em] text-white/45 uppercase mb-2">
                                <span>{item.time}</span>
                                <div
                                    className={cn(
                                        'flex items-center gap-1',
                                        isUp ? 'text-green-600/80' : 'text-red-600/80',
                                    )}
                                >
                                    <Icon className="size-3" />
                                    {isUp ? '+' : ''}
                                    {item.delta}%
                                </div>
                            </div>
                            <p className="text-[14px] text-white/70 leading-snug group-hover:text-white/80 transition-colors">
                                {item.title}
                            </p>
                            <div className="mt-2.5 flex items-center gap-3">
                                <div className="flex-1 h-1 bg-white/8 relative rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'absolute inset-y-0 left-0 rounded-full',
                                            isUp ? 'bg-green-600/60' : 'bg-red-600/60',
                                        )}
                                        style={{ width: `${item.probability}%` }}
                                    />
                                </div>
                                <span className="font-mono text-[11px] text-white/55 tabular-nums w-9 text-right">
                                    {item.probability}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

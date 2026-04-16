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
                            className="p-5 hover:bg-white/3 transition-colors cursor-pointer group"
                        >
                            <div className="flex items-center justify-between font-mono text-[8px] tracking-[0.22em] text-white/45 uppercase mb-3">
                                <span>{item.time}</span>
                                <div
                                    className={cn(
                                        'flex items-center gap-1',
                                        isUp ? 'text-emerald-500/70' : 'text-rose-500/70',
                                    )}
                                >
                                    <Icon className="size-2.5" />
                                    {isUp ? '+' : ''}
                                    {item.delta}%
                                </div>
                            </div>
                            <p className="text-[12px] text-white/70 leading-relaxed group-hover:text-white/80 transition-colors">
                                {item.title}
                            </p>
                            <div className="mt-4 flex items-center gap-3">
                                <div className="flex-1 h-1 bg-white/8 relative rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'absolute inset-y-0 left-0 rounded-full',
                                            isUp ? 'bg-emerald-500/40' : 'bg-rose-500/40',
                                        )}
                                        style={{ width: `${item.probability}%` }}
                                    />
                                </div>
                                <span className="font-mono text-[9px] text-white/55 tabular-nums w-8 text-right">
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

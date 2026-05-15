'use client';
import { JSX, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Market } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';

export default function MarketCard({
    market,
    href,
    overlay,
}: {
    market: Market;
    href?: string;
    /** Optional content rendered absolutely-positioned in the card's top-right
     *  corner, revealed on hover. Use for per-card actions like "Remove". */
    overlay?: ReactNode;
}): JSX.Element {
    const isUp = market.change24h >= 0;
    const detail = getMarketById(market.id);
    const resolved_href = href ?? (detail ? `/market/${detail.slug}` : '#');
    return (
        <Link
            href={resolved_href}
            className="group relative rounded-lg p-4 sm:p-5 bg-dark-base transition-colors cursor-pointer block no-underline"
        >
            {overlay && (
                <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {overlay}
                </div>
            )}
            <div className="flex items-center justify-between text-[11px] tracking-[0.22em] uppercase">
                {market.series ? (
                    <span className="inline-flex items-center gap-1.5 text-rose-300/85">
                        <span className="relative flex size-1.5">
                            <span className="absolute inset-0 size-1.5 rounded-full bg-rose-400/70 animate-ping" />
                            <span className="relative size-1.5 rounded-full bg-rose-400" />
                        </span>
                        LIVE
                    </span>
                ) : (
                    <span className="text-white/55">{market.category}</span>
                )}
                <span className="text-white/45">
                    {market.series ? 'NEXT IN' : 'ENDS IN'} {market.endsIn}
                </span>
            </div>

            <h3 className="mt-3 sm:mt-5 text-[13px] sm:text-[15px] text-white/75 font-medium leading-snug min-h-10 sm:min-h-12 line-clamp-2 hover:underline">
                {market.title}
            </h3>

            {market.series && market.series.upcomingCount > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-amber-300/80">
                    <span className="size-1.5 rounded-full bg-amber-300/70" />
                    +{market.series.upcomingCount} upcoming slots
                </div>
            )}

            <div className="mt-4 sm:mt-6 space-y-2 sm:space-y-2.5">
                <ProbBar
                    label={market.series ? 'UP' : 'YES'}
                    value={market.yesPrice}
                    color="bg-green-500/90"
                />
                <ProbBar
                    label={market.series ? 'DOWN' : 'NO'}
                    value={market.noPrice}
                    color="bg-red-500/90"
                />
            </div>

            <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between gap-2 sm:gap-4 text-[11px] tracking-[0.18em] uppercase flex-wrap">
                <span className="text-white/55">VOL {market.volume}</span>
                <span
                    className={cn(
                        'tabular-nums',
                        isUp ? 'text-emerald-500/70' : 'text-rose-500/70',
                    )}
                >
                    {isUp ? '+' : ''}
                    {market.change24h.toFixed(1)}%
                </span>
            </div>
        </Link>
    );
}

function ProbBar({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}): JSX.Element {
    return (
        <div className="flex items-center gap-2">
            <span className=" text-[11px] tracking-[0.15em] text-white/55 w-7">{label}</span>
            <div className="relative flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                    className={cn('absolute inset-y-0 left-0 rounded-full', color)}
                    style={{ width: `${value}%` }}
                />
            </div>
            <span className=" text-[12px] text-white/70 tabular-nums w-8 text-right">{value}¢</span>
        </div>
    );
}

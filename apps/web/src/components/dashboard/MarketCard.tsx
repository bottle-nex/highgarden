'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Market } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';

export default function MarketCard({
    market,
    href,
}: {
    market: Market;
    href?: string;
}): JSX.Element {
    const isUp = market.change24h >= 0;
    const detail = getMarketById(market.id);
    const resolved_href = href ?? (detail ? `/market/${detail.slug}` : '#');
    return (
        <Link
            href={resolved_href}
            className="group relative rounded-lg p-5 bg-dark-base transition-colors cursor-pointer block no-underline"
        >
            <div className="flex items-center justify-between text-[11px] tracking-[0.22em] uppercase">
                <span className="text-white/55">{market.category}</span>
                <span className="text-white/45">ENDS IN {market.endsIn}</span>
            </div>

            <h3 className="mt-5 text-[15px] text-white/75 font-medium leading-snug min-h-12 line-clamp-2 hover:underline">
                {market.title}
            </h3>

            <div className="mt-6 space-y-2.5">
                <ProbBar label="YES" value={market.yesPrice} color="bg-green-500/90" />
                <ProbBar label="NO" value={market.noPrice} color="bg-red-500/90" />
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between  text-[11px] tracking-[0.18em] uppercase">
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

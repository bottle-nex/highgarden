'use client';
import { JSX } from 'react';
import { cn } from '@/lib/utils';
import type { Market } from '@/utils/constants';

export default function MarketCard({ market }: { market: Market }): JSX.Element {
    const isUp = market.change24h >= 0;
    return (
        <div className="group relative bg-neutral-950 border border-white/10 rounded-[6px] p-5 hover:border-white/20 hover:bg-neutral-900/70 transition-colors cursor-pointer">
            <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.22em] uppercase">
                <span className="text-white/55">
                    {'//'} {market.category}
                </span>
                <span className="text-white/45">ENDS IN {market.endsIn}</span>
            </div>

            <h3 className="mt-5 text-[13px] text-white/75 font-medium leading-snug min-h-10 line-clamp-2">
                {market.title}
            </h3>

            <div className="mt-6 space-y-2.5">
                <ProbBar label="YES" value={market.yesPrice} color="bg-emerald-500/35" />
                <ProbBar label="NO" value={market.noPrice} color="bg-rose-500/22" />
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase">
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
        </div>
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
            <span className="font-mono text-[9px] tracking-[0.15em] text-white/55 w-6">
                {label}
            </span>
            <div className="relative flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                    className={cn('absolute inset-y-0 left-0 rounded-full', color)}
                    style={{ width: `${value}%` }}
                />
            </div>
            <span className="font-mono text-[10px] text-white/70 tabular-nums w-7 text-right">
                {value}¢
            </span>
        </div>
    );
}

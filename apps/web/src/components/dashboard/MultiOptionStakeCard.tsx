'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { MultiOptionMarket } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';

export default function MultiOptionStakeCard({
    market,
}: {
    market: MultiOptionMarket;
}): JSX.Element {
    const detail = getMarketById(market.id);
    const href = detail ? `/market/${detail.slug}` : '#';

    return (
        <Link
            href={href}
            className="group bg-neutral-950 border border-white/10 rounded-[6px] overflow-hidden hover:border-white/20 transition-colors block no-underline"
        >
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/8 font-mono text-[9px] tracking-[0.22em] uppercase">
                <div className="flex items-center gap-3">
                    <span className="inline-block size-1.5 rounded-full bg-alpha" />
                    <span className="text-white/55">{market.category}</span>
                </div>
                <span className="text-white/40">ENDS IN {market.endsIn}</span>
            </div>

            <div className="p-6">
                <h3 className="text-[14px] text-white/80 font-medium leading-snug">
                    {market.title}
                </h3>

                <div className="mt-6 grid grid-cols-2 gap-2.5">
                    {market.options.map((option) => {
                        const isUp = option.change >= 0;
                        return (
                            <div
                                key={option.label}
                                className="relative rounded-[4px] border border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/14 transition-colors cursor-pointer px-4 py-3.5"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[11px] text-white/70 font-medium">
                                        {option.label}
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono text-[8px] tabular-nums',
                                            isUp ? 'text-emerald-500/60' : 'text-rose-500/60',
                                        )}
                                    >
                                        {isUp ? '▲' : '▼'} {Math.abs(option.change).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="mt-2 text-lg font-light text-white/80 tabular-nums">
                                    {option.probability}%
                                </div>
                                <div className="mt-2 h-1 bg-white/6 overflow-hidden">
                                    <div
                                        className="h-full bg-alpha"
                                        style={{ width: `${option.probability}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-between font-mono text-[9px] tracking-[0.18em] uppercase text-white/45">
                    <div className="flex items-center gap-4">
                        <span>VOL {market.volume}</span>
                        <span className="text-white/25">·</span>
                        <span>{market.traders.toLocaleString()} TRADERS</span>
                    </div>
                    <span>{market.options.length} OPTIONS</span>
                </div>
            </div>
        </Link>
    );
}

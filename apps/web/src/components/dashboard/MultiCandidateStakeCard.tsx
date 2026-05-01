'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { MultiCandidateMarket } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';

const BAR_COLORS = [
    'bg-indigo-500/75',
    'bg-sky-400/70',
    'bg-violet-500/70',
    'bg-amber-400/70',
    'bg-teal-400/70',
    'bg-pink-400/65',
];

export default function MultiCandidateStakeCard({
    market,
}: {
    market: MultiCandidateMarket;
}): JSX.Element {
    const maxProb = Math.max(...market.candidates.map((c) => c.probability));
    const detail = getMarketById(market.id);
    const href = detail ? `/market/${detail.slug}` : '#';

    return (
        <Link
            href={href}
            className="group bg-dark-base border border-white/10 rounded-[6px] overflow-hidden hover:border-white/20 transition-colors block no-underline"
        >
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/8  text-[11px] tracking-[0.22em] uppercase">
                <div className="flex items-center gap-3">
                    <span className="inline-block size-1.5 rounded-full bg-indigo-500/70" />
                    <span className="text-white/55">{market.category}</span>
                </div>
                <span className="text-white/40">ENDS IN {market.endsIn}</span>
            </div>

            <div className="p-6">
                <h3 className="text-[16px] text-white/80 font-medium leading-snug">
                    {market.title}
                </h3>

                <div className="mt-6 space-y-3">
                    {market.candidates.map((candidate, i) => {
                        const isUp = candidate.change >= 0;
                        return (
                            <div
                                key={candidate.name}
                                className="flex items-center gap-3 group/row cursor-pointer hover:bg-white/3 -mx-2 px-2 py-1.5 rounded-[4px] transition-colors"
                            >
                                <span className=" text-[12px] text-white/70 w-32 truncate">
                                    {candidate.name}
                                </span>
                                <div className="flex-1 h-2 bg-white/6 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            BAR_COLORS[i % BAR_COLORS.length],
                                        )}
                                        style={{
                                            width: `${(candidate.probability / maxProb) * 100}%`,
                                        }}
                                    />
                                </div>
                                <span className=" text-[13px] text-white/75 tabular-nums w-10 text-right">
                                    {candidate.probability}%
                                </span>
                                <span
                                    className={cn(
                                        ' text-[11px] tabular-nums w-12 text-right',
                                        isUp ? 'text-emerald-500/60' : 'text-rose-500/60',
                                    )}
                                >
                                    {isUp ? '+' : ''}
                                    {candidate.change.toFixed(1)}%
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-between  text-[11px] tracking-[0.18em] uppercase text-white/45">
                    <div className="flex items-center gap-4">
                        <span>VOL {market.volume}</span>
                        <span className="text-white/25">·</span>
                        <span>{market.traders.toLocaleString()} TRADERS</span>
                    </div>
                    <span>{market.candidates.length} CANDIDATES</span>
                </div>
            </div>
        </Link>
    );
}

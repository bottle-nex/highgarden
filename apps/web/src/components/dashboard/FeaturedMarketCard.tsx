'use client';
import { JSX } from 'react';
import { cn } from '@/lib/utils';
import { IoIosArrowRoundForward } from 'react-icons/io';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
import type { FeaturedMarket } from '@/utils/constants';
import ProbabilityChart from './ProbabilityChart';
import { Button } from '../ui/button';

export default function FeaturedMarketCard({ market }: { market: FeaturedMarket }): JSX.Element {
    const TrendIcon = market.trend === 'down' ? HiArrowTrendingDown : HiArrowTrendingUp;

    return (
        <section className="relative bg-neutral-950 border border-white/10 rounded-[6px] overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex items-center justify-between px-8 py-4 border-b border-white/10 font-mono text-[9px] tracking-[0.22em] uppercase">
                <div className="flex items-center gap-4">
                    <span className="text-white/45">FEATURED</span>
                    <span className="text-white/75">
                        {'//'} {market.category}
                    </span>
                </div>
                <div className="hidden md:flex items-center gap-3 text-white/45">
                    <span>OPENS {market.openDate}</span>
                    <span className="text-white/25">→</span>
                    <span>CLOSES {market.closeDate}</span>
                </div>
            </div>

            <div className="p-8 lg:p-10">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-10 items-start">
                    <div>
                        <h2 className="text-xl md:text-2xl text-white/75 font-medium leading-snug tracking-tight max-w-xl">
                            {market.title}
                        </h2>
                        <p className="mt-4 text-[13px] text-white/50 max-w-xl leading-relaxed">
                            {market.description}
                        </p>
                    </div>

                    <div className="flex flex-col items-start lg:items-end gap-3">
                        <span className="font-mono text-[9px] tracking-[0.22em] text-white/45 uppercase">
                            CURRENT YES
                        </span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-light text-white/75 tabular-nums leading-none">
                                {market.currentProbability}
                            </span>
                            <span className="text-base text-white/50 font-mono">%</span>
                        </div>
                        <div
                            className={cn(
                                'flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em]',
                                market.trend === 'down'
                                    ? 'text-rose-500/75'
                                    : 'text-emerald-500/75',
                            )}
                        >
                            <TrendIcon className="size-3" />
                            +12% THIS WEEK
                        </div>
                    </div>
                </div>

                <div className="mt-10">
                    <ProbabilityChart data={market.probabilities} />
                </div>

                <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-[6px] overflow-hidden">
                    <Stat label="VOLUME" value={market.volume} />
                    <Stat label="LIQUIDITY" value={market.liquidity} />
                    <Stat label="TRADERS" value={market.traders.toLocaleString()} />
                    <Stat label="24H Δ" value="+4.2%" accent />
                </div>

                <div className="mt-8 flex items-center gap-3">
                    <Button
                        className={cn(
                            'flex-1 h-11 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 font-mono text-[11px] tracking-[0.2em] uppercase text-emerald-400/70 font-semibold',
                        )}
                    >
                        BUY YES · 47¢
                    </Button>
                    <Button
                        className={cn(
                            'flex-1 h-11 rounded-md bg-rose-500/8 hover:bg-rose-500/18 border border-rose-500/20 font-mono text-[11px] tracking-[0.2em] uppercase text-rose-400/70',
                        )}
                    >
                        BUY NO · 53¢
                    </Button>
                    <Button
                        className={cn(
                            'h-11 w-11 px-0 rounded-md bg-transparent border border-white/12 hover:bg-white/5 text-white/65 cursor-pointer',
                        )}
                    >
                        <IoIosArrowRoundForward className="size-5" />
                    </Button>
                </div>
            </div>
        </section>
    );
}

function Stat({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
}): JSX.Element {
    return (
        <div className="bg-neutral-950 px-5 py-5">
            <div className="font-mono text-[9px] tracking-[0.22em] text-white/45 uppercase">
                {label}
            </div>
            <div
                className={cn(
                    'mt-2 text-base tabular-nums',
                    accent ? 'text-emerald-400/65' : 'text-white/75',
                )}
            >
                {value}
            </div>
        </div>
    );
}

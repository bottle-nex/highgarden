'use client';
import { JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import Image from 'next/image';
import { IoIosArrowRoundForward } from 'react-icons/io';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
import type { FeaturedMarket } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';
import ProbabilityChart from './ProbabilityChart';
import { Button } from '../ui/button';

function placeholder_gradient(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 60) % 360;
    return `linear-gradient(135deg, hsl(${h}, 65%, 22%), hsl(${h2}, 70%, 14%))`;
}

export default function FeaturedMarketCard({
    market,
    href,
}: {
    market: FeaturedMarket;
    href?: string;
}): JSX.Element {
    const TrendIcon = market.trend === 'down' ? HiArrowTrendingDown : HiArrowTrendingUp;
    const detail = getMarketById(market.id);
    const resolved_href = href ?? (detail ? `/market/${detail.slug}` : '#');
    const [img_error, set_img_error] = useState(false);
    const show_image = !!market.imageUrl && !img_error;

    return (
        <Link
            href={resolved_href}
            className="relative bg-[#141B2190] ring-1 ring-gray-500/15 shadow-xs shadow-black/5 rounded-lg overflow-hidden group transition-colors no-underline h-full flex flex-col"
        >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-500/15  text-[10px] tracking-[0.22em] uppercase shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-white/75">{market.category}</span>
                </div>
                <div className="hidden md:flex items-center gap-2 text-white/45">
                    <span>OPENS {market.openDate}</span>
                    <span className="text-white/25">→</span>
                    <span>CLOSES {market.closeDate}</span>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col p-5">
                <div className="flex items-start justify-between gap-6 shrink-0">
                    <div className="min-w-0 flex-1 flex items-start gap-3">
                        <div
                            className="shrink-0 w-12 h-12 rounded-md border border-white/10 overflow-hidden"
                            style={
                                show_image
                                    ? undefined
                                    : { background: placeholder_gradient(market.id) }
                            }
                            aria-hidden
                        >
                            {show_image && (
                                <Image
                                    src={market.imageUrl!}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={() => set_img_error(true)}
                                    width={48}
                                    height={48}
                                />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl text-white/85 font-medium leading-snug tracking-tight line-clamp-2">
                                {market.title}
                            </h2>
                            <p className="mt-2 text-[12px] text-white/50 leading-relaxed line-clamp-1">
                                {market.description}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className=" text-[9px] tracking-[0.22em] text-white/45 uppercase">
                            CURRENT YES
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-light text-white/85 tabular-nums leading-none">
                                {market.currentProbability}
                            </span>
                            <span className="text-sm text-white/50 ">%</span>
                        </div>
                        <div
                            className={cn(
                                'flex items-center gap-1  text-[10px] tracking-[0.18em] whitespace-nowrap',
                                market.trend === 'down' ? 'text-red-600/60' : 'text-green-600/80',
                            )}
                        >
                            <TrendIcon className="size-3" />
                            +12% THIS WEEK
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 mt-3">
                    <ProbabilityChart data={market.probabilities} height="100%" />
                </div>

                <div className="mt-3 flex items-center gap-4 px-3 py-2 border border-white/10 rounded-[6px] bg-neutral-950  text-[10px] tracking-[0.18em] uppercase shrink-0">
                    <Stat label="VOL" value={market.volume} />
                    <Sep />
                    <Stat label="LIQ" value={market.liquidity} />
                    <Sep />
                    <Stat label="TRADERS" value={market.traders.toLocaleString()} />
                    <Sep />
                    <Stat label="24H Δ" value="+4.2%" accent />
                </div>

                <div className="mt-3 flex items-center gap-2 shrink-0">
                    <Button
                        className={cn(
                            'flex-1 h-9 rounded-sm bg-green-500/10 hover:bg-green-500/15 border border-green-500/25 text-[10px] tracking-[0.2em] uppercase text-green-400/70 font-semibold',
                        )}
                    >
                        BUY YES · 47¢
                    </Button>
                    <Button
                        className={cn(
                            'flex-1 h-9 rounded-sm bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 text-[10px] tracking-[0.2em] uppercase text-red-400/70',
                        )}
                    >
                        BUY NO · 53¢
                    </Button>
                    <Button
                        className={cn(
                            'h-9 w-9 px-0 rounded-sm bg-transparent border border-white/12 hover:bg-white/5 text-white/65 cursor-pointer',
                        )}
                    >
                        <IoIosArrowRoundForward className="size-5" />
                    </Button>
                </div>
            </div>
        </Link>
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
        <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-white/45 shrink-0">{label}</span>
            <span
                className={cn(
                    'tabular-nums truncate',
                    accent ? 'text-emerald-400/70' : 'text-white/80',
                )}
            >
                {value}
            </span>
        </div>
    );
}

function Sep(): JSX.Element {
    return <span className="text-white/15">·</span>;
}

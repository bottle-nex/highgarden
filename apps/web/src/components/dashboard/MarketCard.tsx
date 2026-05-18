'use client';
import { JSX, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
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
    const TrendIcon = isUp ? HiArrowTrendingUp : HiArrowTrendingDown;
    const detail = getMarketById(market.id);
    const resolved_href = href ?? (detail ? `/market/${detail.slug}` : `/event/${market.id}`);
    const [img_error, set_img_error] = useState(false);
    const show_image = !!market.imageUrl && !img_error;

    return (
        <Link
            href={resolved_href}
            className="group relative bg-dark-base rounded-[6px] overflow-hidden hover:border-white/20 transition-colors flex flex-col h-full no-underline"
        >
            {overlay && (
                <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {overlay}
                </div>
            )}

            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-3.5 border-b border-white/8 text-[9px] tracking-[0.22em] uppercase">
                {market.series ? (
                    <span className="inline-flex items-center gap-1.5 text-rose-300/85">
                        <span className="relative flex size-1.5">
                            <span className="absolute inset-0 size-1.5 rounded-full bg-rose-400/70 animate-ping" />
                            <span className="relative size-1.5 rounded-full bg-rose-400" />
                        </span>
                        LIVE
                    </span>
                ) : (
                    <div className="flex items-center gap-3">
                        <span className="inline-block size-1.5 rounded-full bg-emerald-500/60" />
                        <span className="text-white/55">{market.category}</span>
                    </div>
                )}
                <span className="text-white/40">
                    {market.series ? 'NEXT IN' : 'ENDS IN'} {market.endsIn}
                </span>
            </div>

            <div className="p-4 sm:p-6 flex flex-col flex-1">
                <div className="flex items-start gap-3">
                    {show_image && (
                        <Image
                            src={market.imageUrl!}
                            alt=""
                            width={40}
                            height={40}
                            className="shrink-0 rounded-lg object-cover border-2 border-white"
                            onError={() => set_img_error(true)}
                        />
                    )}
                    <div className="min-w-0">
                        <h3 className="text-[13px] sm:text-[15px] text-white/80 font-medium leading-snug hover:underline line-clamp-2">
                            {market.title}
                        </h3>
                        {market.description && (
                            <p className="mt-2 sm:mt-2.5 text-[12px] text-white/40 leading-relaxed line-clamp-2">
                                {market.description}
                            </p>
                        )}
                    </div>
                </div>

                {market.series && market.series.upcomingCount > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-amber-300/80 self-start">
                        <span className="size-1.5 rounded-full bg-amber-300/70" />
                        +{market.series.upcomingCount} upcoming slots
                    </div>
                )}

                <div className="mt-auto flex flex-col">
                    <div className="pt-4 sm:pt-5 flex items-center gap-2 sm:gap-3">
                        <div className="green-btn flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-[4px] font-semibold text-[11px] sm:text-[12px]">
                            <span className="tracking-[0.15em] uppercase">
                                {market.series ? 'UP' : 'YES'}
                            </span>
                            <span className="text-[12px] tabular-nums">{market.yesPrice}¢</span>
                        </div>
                        <div className="red-btn flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-[4px] font-semibold text-[11px] sm:text-[12px]">
                            <span className="tracking-[0.15em] uppercase">
                                {market.series ? 'DOWN' : 'NO'}
                            </span>
                            <span className="text-[12px] tabular-nums">{market.noPrice}¢</span>
                        </div>
                    </div>

                    <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-white/8 flex items-center justify-between gap-2 sm:gap-4 text-[9px] tracking-[0.18em] uppercase flex-wrap">
                        <div className="flex items-center gap-4 text-white/55">
                            <span>VOL {market.volume}</span>
                            {market.traders !== undefined && (
                                <>
                                    <span className="text-white/25">·</span>
                                    <span>{market.traders.toLocaleString()} TRADERS</span>
                                </>
                            )}
                        </div>
                        <div
                            className={cn(
                                'flex items-center gap-1 tabular-nums',
                                isUp ? 'text-emerald-500/70' : 'text-rose-500/70',
                            )}
                        >
                            <TrendIcon className="size-2.5" />
                            {isUp ? '+' : ''}
                            {market.change24h.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

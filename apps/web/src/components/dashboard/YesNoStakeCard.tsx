'use client';
import { JSX, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { HiArrowTrendingUp, HiArrowTrendingDown } from 'react-icons/hi2';
import type { YesNoMarket } from '@/utils/constants';
import { getMarketById } from '@/utils/constants';

export default function YesNoStakeCard({ market }: { market: YesNoMarket }): JSX.Element {
    const isUp = market.change24h >= 0;
    const TrendIcon = isUp ? HiArrowTrendingUp : HiArrowTrendingDown;
    const detail = getMarketById(market.id);
    const href = detail ? `/market/${detail.slug}` : `/event/${market.id}`;
    const [img_error, set_img_error] = useState(false);
    const show_image = !!market.imageUrl && !img_error;

    return (
        <Link
            href={href}
            className="group bg-dark-base border border-white/10 rounded-[6px] overflow-hidden hover:border-white/20 transition-colors block no-underline"
        >
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/8  text-[9px] tracking-[0.22em] uppercase">
                <div className="flex items-center gap-3">
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500/60" />
                    <span className="text-white/55">{market.category}</span>
                </div>
                <span className="text-white/40">ENDS IN {market.endsIn}</span>
            </div>

            <div className="p-6">
                <div className="flex items-start gap-3">
                    {show_image && (
                        <Image
                            src={market.imageUrl!}
                            alt=""
                            width={40}
                            height={40}
                            className="shrink-0 rounded object-cover"
                            onError={() => set_img_error(true)}
                        />
                    )}
                    <div className="min-w-0">
                        <h3 className="text-[14px] text-white/80 font-medium leading-snug">
                            {market.title}
                        </h3>
                        <p className="mt-2.5 text-[12px] text-white/40 leading-relaxed line-clamp-2">
                            {market.description}
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex items-center gap-3">
                    <div className="green-btn flex-1 flex items-center justify-center gap-2 py-2 rounded-[4px] border border-emerald-500/20">
                        <span className="text-[9px] tracking-[0.15em] uppercase">YES</span>
                        <span className="text-[12px] tabular-nums">{market.yesPrice}¢</span>
                    </div>
                    <div className="red-btn flex-1 flex items-center justify-center gap-2 py-2 rounded-[4px] border border-rose-500/15">
                        <span className="text-[9px] tracking-[0.15em] uppercase">NO</span>
                        <span className="text-[12px] tabular-nums">{market.noPrice}¢</span>
                    </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/8 flex items-center justify-between  text-[9px] tracking-[0.18em] uppercase text-white/45">
                    <div className="flex items-center gap-4">
                        <span>VOL {market.volume}</span>
                        <span className="text-white/25">·</span>
                        <span>{market.traders.toLocaleString()} TRADERS</span>
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
        </Link>
    );
}

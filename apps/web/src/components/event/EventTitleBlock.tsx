'use client';

import { JSX, useState } from 'react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import Image from 'next/image';
import { PiShareFat, PiBookmarkSimple } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import ToolTipComponent from '@/components/utility/ToolTipComponent';

function placeholder_gradient(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 60) % 360;
    return `linear-gradient(135deg, hsl(${h}, 65%, 22%), hsl(${h2}, 70%, 14%))`;
}

interface Props {
    market: MarketDTO;
    is_stuck?: boolean;
}

export default function EventTitleBlock({ market, is_stuck }: Props): JSX.Element {
    const handle_share = () => toast.info('Share link coming soon');
    const handle_bookmark = () => toast.info('Bookmark coming soon');
    const [img_error, set_img_error] = useState(false);

    const show_image = !!market.imageUrl && !img_error;
    const compact = !!is_stuck;

    const ease = 'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]';

    return (
        <header
            className={`flex gap-4 items-start h-14 ${ease}${
                compact ? ' lg:items-center lg:h-10' : ''
            }`}
        >
            <div
                className={`shrink-0 w-14 h-14 rounded-md border border-white/10 overflow-hidden ${ease}${
                    compact ? ' lg:w-10 lg:h-10' : ''
                }`}
                style={show_image ? undefined : { background: placeholder_gradient(market.id) }}
                aria-hidden
            >
                {show_image && (
                    <Image
                        src={market.imageUrl!}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => set_img_error(true)}
                        width={52}
                        height={52}
                    />
                )}
            </div>
            <div
                className={`flex-1 min-w-0 flex flex-col justify-between h-full${
                    compact ? ' lg:justify-center' : ''
                }`}
            >
                <h1
                    className={`text-3xl text-white leading-none font-medium ${ease}${
                        compact ? ' lg:text-lg' : ''
                    }`}
                >
                    {market.name}
                </h1>
                {market.description && (
                    <div
                        className={`grid grid-rows-[1fr] opacity-100 overflow-hidden ${ease}${
                            compact ? ' lg:grid-rows-[0fr] lg:opacity-0' : ''
                        }`}
                    >
                        <p className="text-[14px] text-white/55 leading-[1.2] line-clamp-1 max-w-3xl min-h-0">
                            {market.description}
                        </p>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <ToolTipComponent side='top' content="Share">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Share"
                        onClick={handle_share}
                        className="rounded-md border-white/10 bg-dark-base hover:border-white/25 text-white/55 hover:text-white"
                    >
                        <PiShareFat />
                    </Button>
                </ToolTipComponent>
                <ToolTipComponent side='top' content="Bookmark">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Bookmark"
                        onClick={handle_bookmark}
                        className="rounded-md border-white/10 bg-dark-base hover:border-white/25 text-white/55 hover:text-white"
                    >
                        <PiBookmarkSimple />
                    </Button>
                </ToolTipComponent>
            </div>
        </header>
    );
}

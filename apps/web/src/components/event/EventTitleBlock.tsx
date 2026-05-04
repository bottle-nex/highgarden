'use client';

import { JSX, useState } from 'react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import Image from 'next/image';
import { PiShareFat, PiBookmarkSimple, PiBookmarkSimpleFill } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import ToolTipComponent from '@/components/utility/ToolTipComponent';
import { useBookmarksStore } from '@/store/bookmarks/useBookmarksStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { cn } from '@/lib/utils';

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
    const [img_error, set_img_error] = useState(false);

    const session = useUserSessionStore((s) => s.session);
    const setOpenSigninModal = useUserSessionStore((s) => s.setOpenSigninModal);
    const is_bookmarked = useBookmarksStore((s) => s.ids.has(market.id));
    const toggle_bookmark = useBookmarksStore((s) => s.toggle);
    const [pending, set_pending] = useState<boolean>(false);

    const handle_bookmark = async () => {
        if (!session?.user) {
            setOpenSigninModal(true);
            return;
        }
        if (pending) return;
        set_pending(true);
        try {
            const next = await toggle_bookmark(market.id);
            toast.success(next ? 'Bookmarked' : 'Removed bookmark');
        } catch {
            toast.error('Could not update bookmark');
        } finally {
            set_pending(false);
        }
    };

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
                {(market.description || market.tags.length > 0) && (
                    <div
                        className={`grid grid-rows-[1fr] opacity-100 overflow-hidden ${ease}${
                            compact ? ' lg:grid-rows-[0fr] lg:opacity-0' : ''
                        }`}
                    >
                        <div className="min-h-0 flex flex-col gap-1.5">
                            {market.description && (
                                <p className="text-[14px] text-white/55 leading-[1.2] line-clamp-1 max-w-3xl">
                                    {market.description}
                                </p>
                            )}
                            {/* {market.tags.length > 0 && (
                                <ul className="flex flex-wrap items-center gap-1">
                                    {market.tags.slice(0, 5).map((tag) => (
                                        <li
                                            key={tag}
                                            className="px-2 py-1 rounded-sm border border-white/10 bg-dark-base text-[10px] tracking-wider uppercase text-white/55"
                                        >
                                            {tag}
                                        </li>
                                    ))}
                                </ul>
                            )} */}
                        </div>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <ToolTipComponent side="top" content="Share">
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
                <ToolTipComponent
                    side="top"
                    content={is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                        aria-pressed={is_bookmarked}
                        disabled={pending}
                        onClick={handle_bookmark}
                        className={cn(
                            'rounded-md border-white/10 bg-dark-base hover:border-white/10 transition-colors',
                            is_bookmarked
                                ? 'text-white border-white/10'
                                : 'text-white/55 hover:text-white',
                        )}
                    >
                        {is_bookmarked ? <PiBookmarkSimpleFill /> : <PiBookmarkSimple />}
                    </Button>
                </ToolTipComponent>
            </div>
        </header>
    );
}

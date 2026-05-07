'use client';

import { JSX, useState } from 'react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import Image from 'next/image';
import { PiShareFat, PiBookmarkSimple, PiBookmarkSimpleFill } from 'react-icons/pi';
import ToolTipComponent from '@/components/utility/ToolTipComponent';
import { useBookmarksStore } from '@/store/bookmarks/useBookmarksStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { cn } from '@/lib/utils';
import { IoCheckmarkOutline } from 'react-icons/io5';
import { AnimatePresence, motion } from 'framer-motion';

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
    const [img_error, set_img_error] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);

    const handle_share = async () => {
        const url = `${window.location.origin}/event/${market.id}`;
        const is_mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        try {
            if (is_mobile && navigator.share) {
                await navigator.share({ title: market.name, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success('Link copied');
            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') return;
            toast.error('Could not share link');
        }
    };

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
            className={cn(
                'flex gap-4 items-start h-14',
                ease,
                compact && 'lg:items-center lg:h-10',
            )}
        >
            <div
                className={cn(
                    'shrink-0 w-14 h-14 rounded-md border border-white/10 overflow-hidden',
                    ease,
                    compact && 'lg:w-10 lg:h-10',
                )}
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
                className={cn(
                    'flex-1 min-w-0 flex flex-col justify-between h-full',
                    compact && 'lg:justify-center',
                )}
            >
                <h1
                    className={cn(
                        'text-3xl text-white leading-none font-medium',
                        ease,
                        compact && 'lg:text-lg',
                    )}
                >
                    {market.name}
                </h1>
                {(market.description || market.tags.length > 0) && (
                    <div
                        className={cn(
                            'grid grid-rows-[1fr] opacity-100 overflow-hidden',
                            ease,
                            compact && 'lg:grid-rows-[0fr] lg:opacity-0',
                        )}
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
            <div className="flex items-center gap-1.5 shrink-0">
                <ToolTipComponent side="top" content={`${copied ? 'Copied link' : 'Share'}`}>
                    <motion.button
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 100, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                        aria-label="Share"
                        onClick={handle_share}
                        className={cn(
                            'size-7 flex justify-center items-center',
                            'rounded-md ring-1 ring-white/8 bg-dark-faded/30 shadow-xs shadow-black/10',
                            'text-neutral-300 hover:text-neutral-100',
                            'transition-all transform duration-250',
                            'cursor-pointer active:scale-[0.97]',
                        )}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={copied ? 'check' : 'share'}
                                initial={{ opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                                transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
                                className="flex"
                            >
                                {copied ? <IoCheckmarkOutline /> : <PiShareFat />}
                            </motion.span>
                        </AnimatePresence>
                    </motion.button>
                </ToolTipComponent>
                <ToolTipComponent
                    side="top"
                    content={is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 100, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                        aria-label={is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                        aria-pressed={is_bookmarked}
                        disabled={pending}
                        onClick={handle_bookmark}
                        className={cn(
                            'size-7 flex justify-center items-center',
                            'rounded-md ring-1 ring-white/8 bg-dark-faded/30 shadow-xs shadow-black/10',
                            'text-neutral-300 hover:text-neutral-100',
                            'transition-all transform duration-250',
                            'cursor-pointer active:scale-[0.97]',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                        )}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={is_bookmarked ? 'filled' : 'empty'}
                                initial={{ opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 0.6, filter: 'blur(4px)' }}
                                transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
                                className="flex"
                            >
                                {is_bookmarked ? <PiBookmarkSimpleFill /> : <PiBookmarkSimple />}
                            </motion.span>
                        </AnimatePresence>
                    </motion.button>
                </ToolTipComponent>
            </div>
        </header>
    );
}

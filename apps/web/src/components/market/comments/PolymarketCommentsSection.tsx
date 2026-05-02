'use client';
import { JSX, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { PiHeartFill } from 'react-icons/pi';
import type { PolymarketCommentDTO } from '@solmarket/types';
import { fetch_polymarket_comments } from './api';
import { format_position_usd, initials_from, relative_time } from './utils';
import CommentBody from './CommentBody';

interface Props {
    market_id: string;
}

const PAGE_SIZE = 30;
const HOLDERS_ONLY = true;

export default function PolymarketCommentsSection({ market_id }: Props): JSX.Element {
    const [comments, set_comments] = useState<PolymarketCommentDTO[]>([]);
    const [offset, set_offset] = useState(0);
    const [loading, set_loading] = useState(true);
    const [error, set_error] = useState<string | null>(null);
    const [has_more, set_has_more] = useState(false);
    const [available, set_available] = useState(true);

    const load_initial = useCallback(async () => {
        set_loading(true);
        set_error(null);
        try {
            const result = await fetch_polymarket_comments(market_id, {
                limit: PAGE_SIZE,
                offset: 0,
                holders_only: HOLDERS_ONLY,
            });
            set_comments(result.comments);
            set_offset(result.comments.length);
            set_has_more(result.comments.length === PAGE_SIZE);
            set_available(result.event_id !== null);
        } catch (err) {
            console.error('[polymarket-comments] load_initial', err);
            set_error('Could not load Polymarket comments');
        } finally {
            set_loading(false);
        }
    }, [market_id]);

    useEffect(() => {
        void load_initial();
    }, [load_initial]);

    async function load_more() {
        try {
            const result = await fetch_polymarket_comments(market_id, {
                limit: PAGE_SIZE,
                offset,
                holders_only: HOLDERS_ONLY,
            });
            set_comments((prev) => [...prev, ...result.comments]);
            set_offset((prev) => prev + result.comments.length);
            set_has_more(result.comments.length === PAGE_SIZE);
        } catch (err) {
            console.error('[polymarket-comments] load_more', err);
            set_error('Could not load more');
        }
    }

    if (!available) return <></>;

    if (loading) return <></>;

    if (error) {
        return (
            <div className="py-6 text-center text-[10px] tracking-[0.3em] uppercase text-rose-400/80">
                {error}
            </div>
        );
    }

    if (comments.length === 0) return <></>;

    return (
        <section>
            <div className="flex flex-col">
                {comments.map((c) => (
                    <PolymarketRow key={c.id} comment={c} />
                ))}
            </div>
            {has_more && (
                <div className="mt-6 flex justify-center">
                    <button
                        type="button"
                        onClick={load_more}
                        className="rounded-md border border-white/10 px-5 py-2 text-[10px] tracking-[0.3em] uppercase text-white/55 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
                    >
                        Load more
                    </button>
                </div>
            )}
        </section>
    );
}

function PolymarketRow({ comment }: { comment: PolymarketCommentDTO }): JSX.Element {
    const display_name = comment.author.name || comment.author.pseudonym || 'anon';
    const total_position = comment.positions.reduce(
        (sum, p) => sum + p.positionUsd,
        0,
    );

    return (
        <div className="grid grid-cols-[36px_1fr] gap-4 py-4">
            <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-white/10 to-white/5 border border-white/10 text-[12px] font-semibold text-white/70 select-none">
                {comment.author.profileImage ? (
                    <Image
                        src={comment.author.profileImage}
                        alt={display_name}
                        width={36}
                        height={36}
                        className="size-full object-cover"
                        unoptimized
                    />
                ) : (
                    initials_from(display_name)
                )}
            </div>
            <div className="min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[13.5px] font-medium text-white/90 leading-none">
                        {display_name}
                    </span>
                    {comment.author.walletShort && (
                        <span className="text-[10.5px] tabular-nums text-white/35 leading-none">
                            {comment.author.walletShort}
                        </span>
                    )}
                    {total_position > 0 && (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/12 border border-emerald-400/15 px-2 py-0.5 text-[10px] tabular-nums tracking-[0.05em] text-emerald-300 leading-none font-medium">
                            {format_position_usd(total_position)}
                        </span>
                    )}
                    <span className="text-[10.5px] tabular-nums text-white/30 leading-none">
                        ·
                    </span>
                    <span className="text-[10.5px] tabular-nums text-white/35 leading-none">
                        {relative_time(comment.createdAt)}
                    </span>
                </div>
                <CommentBody body={comment.body} />
                {comment.reactionCount > 0 && (
                    <div className="flex items-center gap-4 mt-2">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-white/55 tabular-nums">
                            <PiHeartFill className="size-4 text-rose-500 opacity-90"  />
                            {comment.reactionCount}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

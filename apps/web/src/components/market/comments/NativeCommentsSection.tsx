'use client';
import { JSX, useCallback, useEffect, useState } from 'react';
import { PiChatCircleFill, PiFlagBold } from 'react-icons/pi';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CroppedButton } from '@/components/ui/cropped-button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import type { CommentDTO } from '@solmarket/types';
import { fetch_native_comments, post_native_comment, report_comment } from './api';
import { initials_from, relative_time } from './utils';
import CommentBody from './CommentBody';
import { cn } from '@/lib/utils';

interface NativeCommentsSectionProps {
    market_id: string;
}

interface CommentRowProps {
    comment: CommentDTO;
    reported: boolean;
    on_report: () => void;
}

const PAGE_SIZE = 30;
const MAX_BODY = 2000;

export default function NativeCommentsSection({
    market_id,
}: NativeCommentsSectionProps): JSX.Element {
    const session = useUserSessionStore((state) => state.session);
    const is_signed_in = !!session?.user?.token;
    const [comments, set_comments] = useState<CommentDTO[]>([]);
    const [offset, set_offset] = useState(0);
    const [loading, set_loading] = useState(true);
    const [error, set_error] = useState<string | null>(null);
    const [has_more, set_has_more] = useState(false);
    const [available, set_available] = useState(true);
    const [body, set_body] = useState('');
    const [posting, set_posting] = useState(false);
    const [reported_ids, set_reported_ids] = useState<Set<string>>(new Set());

    const load_initial = useCallback(async () => {
        set_loading(true);
        set_error(null);
        try {
            const result = await fetch_native_comments(market_id, {
                limit: PAGE_SIZE,
                offset: 0,
            });
            set_comments(result.comments);
            set_offset(result.comments.length);
            set_has_more(result.comments.length === PAGE_SIZE);
            set_available(result.event_id !== null);
        } catch (err) {
            console.error('[comments] load_initial', err);
            set_error('Could not load comments');
        } finally {
            set_loading(false);
        }
    }, [market_id]);

    useEffect(() => {
        void load_initial();
    }, [load_initial]);

    async function load_more() {
        try {
            const result = await fetch_native_comments(market_id, {
                limit: PAGE_SIZE,
                offset,
            });
            set_comments((prev) => [...prev, ...result.comments]);
            set_offset((prev) => prev + result.comments.length);
            set_has_more(result.comments.length === PAGE_SIZE);
        } catch (err) {
            console.error('[comments] load_more', err);
            set_error('Could not load more comments');
        }
    }

    async function submit() {
        if (!body.trim() || posting) return;
        set_posting(true);
        try {
            const created = await post_native_comment(market_id, body.trim());
            set_comments((prev) => [created, ...prev]);
            set_offset((prev) => prev + 1);
            set_body('');
        } catch (err) {
            console.error('[comments] submit', err);
            set_error('Could not post comment');
        } finally {
            set_posting(false);
        }
    }

    async function on_report(comment_id: string) {
        if (reported_ids.has(comment_id)) return;
        set_reported_ids((prev) => new Set(prev).add(comment_id));
        try {
            await report_comment(comment_id);
        } catch (err) {
            console.error('[comments] report', err);
            set_reported_ids((prev) => {
                const next = new Set(prev);
                next.delete(comment_id);
                return next;
            });
        }
    }

    const trimmed_len = body.trim().length;
    const over_limit = trimmed_len > MAX_BODY;
    const can_submit = is_signed_in && trimmed_len > 0 && !over_limit && !posting;

    return (
        <section>
            <header className="flex items-center justify-between py-5">
                <div className="flex items-center gap-3">
                    <PiChatCircleFill className="size-3.5 text-white/35" />
                    <span className="text-[10px] tracking-[0.32em] uppercase text-white/70 font-medium">
                        Solmarket Discussion
                    </span>
                </div>
                <span className="text-[10px] tracking-[0.32em] uppercase text-white/35 tabular-nums">
                    {comments.length} {comments.length === 1 ? 'Post' : 'Posts'}
                </span>
            </header>

            <div>
                {available && (
                    <div className="pb-6 mb-6 border-b border-white/7">
                        <textarea
                            className="w-full min-h-22 resize-none rounded-md bg-dark-base px-4 py-3 text-sm leading-relaxed text-white/85 placeholder:text-white/30 focus:border-white/25 focus:outline-none focus:ring-0 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            placeholder={
                                is_signed_in
                                    ? 'Share your take on this market...'
                                    : 'Sign in to post a comment'
                            }
                            disabled={!is_signed_in || posting}
                            value={body}
                            maxLength={MAX_BODY + 200}
                            onChange={(e) => set_body(e.target.value)}
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                            <span
                                className={`text-[10px] tracking-[0.18em] uppercase tabular-nums ${
                                    over_limit ? 'text-rose-400' : 'text-white/35'
                                }`}
                            >
                                {body.length} / {MAX_BODY}
                            </span>
                            {is_signed_in ? (
                                <CroppedButton
                                    size="sm"
                                    type="button"
                                    disabled={!can_submit}
                                    onClick={submit}
                                    className={cn(
                                        'px-4 text-[12px] font-[510] tracking-normal uppercase',
                                        'bg-white text-neutral-900',
                                        'transition-all duration-200',
                                    )}
                                >
                                    {posting ? 'Posting' : 'Post'}
                                </CroppedButton>
                            ) : (
                                // Wrap in a span trigger when signed out so the
                                // tooltip ref attaches to a real DOM node;
                                // CroppedButton isn't forwardRef-aware, which
                                // is why nesting it directly in TooltipTrigger
                                // breaks its clip-path measurement.
                                <Tooltip>
                                    <TooltipTrigger
                                        render={(props: React.HTMLAttributes<HTMLSpanElement>) => (
                                            <span {...props} className="inline-flex">
                                                <CroppedButton
                                                    size="sm"
                                                    type="button"
                                                    disabled
                                                    className={cn(
                                                        'px-6! text-[12px] font-[510] tracking-normal uppercase',
                                                        'bg-white text-neutral-900',
                                                        'transition-all duration-200',
                                                    )}
                                                >
                                                    Post
                                                </CroppedButton>
                                            </span>
                                        )}
                                    />
                                    <TooltipContent>Sign in to join the discussion</TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-10 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                        Loading...
                    </div>
                ) : error ? (
                    <div className="py-10 text-center">
                        <div className="text-[10px] tracking-[0.3em] uppercase text-rose-400/80">
                            {error}
                        </div>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="py-10 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                        {available
                            ? 'Be the first to post'
                            : 'Comments unavailable for this market'}
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col">
                            {comments.map((c) => (
                                <CommentRow
                                    key={c.id}
                                    comment={c}
                                    reported={reported_ids.has(c.id)}
                                    on_report={() => on_report(c.id)}
                                />
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
                    </>
                )}
            </div>
        </section>
    );
}

function CommentRow({ comment, reported, on_report }: CommentRowProps): JSX.Element {
    return (
        <div className="grid grid-cols-[36px_1fr] gap-4 py-4">
            <div className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-white/10 to-white/5 border border-white/10 text-[12px] font-semibold text-white/70 select-none">
                {initials_from(comment.author.username)}
            </div>
            <div className="min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[13.5px] font-medium text-white/90 leading-none">
                        {comment.author.username}
                    </span>
                    {comment.author.walletShort && (
                        <span className="text-[10.5px] tabular-nums text-white/35 leading-none">
                            {comment.author.walletShort}
                        </span>
                    )}
                    <span className="text-[10.5px] tabular-nums text-white/30 leading-none">·</span>
                    <span className="text-[10.5px] tabular-nums text-white/35 leading-none">
                        {relative_time(comment.createdAt)}
                    </span>
                </div>
                <CommentBody body={comment.body} />
                <div className="flex items-center gap-4 mt-1">
                    <button
                        type="button"
                        onClick={on_report}
                        disabled={reported}
                        className={`inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase transition-colors cursor-pointer ${
                            reported
                                ? 'text-rose-400/80 cursor-default'
                                : 'text-white/30 hover:text-rose-400/80'
                        }`}
                    >
                        <PiFlagBold className="size-2.5" />
                        {reported ? 'Reported' : 'Report'}
                    </button>
                </div>
            </div>
        </div>
    );
}

'use client';

import { JSX, useEffect, useState } from 'react';
import type { NewsArticleDTO } from '@solmarket/types';
import { fetch_market_news } from '@/lib/api/markets';

interface Props {
    marketId: string;
}

type State = { status: 'loading' } | { status: 'ready'; articles: NewsArticleDTO[] };

function format_relative(iso: string | null): string {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff_ms = Date.now() - t;
    if (diff_ms < 0) return '';
    const min = Math.round(diff_ms / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.round(hr / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function EventNews({ marketId }: Props): JSX.Element {
    const [state, set_state] = useState<State>({ status: 'loading' });
    const [last_id, set_last_id] = useState(marketId);

    if (last_id !== marketId) {
        set_last_id(marketId);
        set_state({ status: 'loading' });
    }

    useEffect(() => {
        let cancelled = false;
        fetch_market_news(marketId).then((articles) => {
            if (cancelled) return;
            set_state({ status: 'ready', articles });
        });
        return () => {
            cancelled = true;
        };
    }, [marketId]);

    return (
        <section>
            <header className="flex items-center justify-between px-5 py-4">
                <h3 className="text-[10px] tracking-[0.25em] uppercase text-white/55">
                    Related news
                </h3>
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/30">
                    via Google News
                </span>
            </header>

            {state.status === 'loading' && (
                <div className="px-5 py-8 text-sm text-white/40">Loading news…</div>
            )}

            {state.status === 'ready' && state.articles.length === 0 && (
                <div className="px-5 py-8 text-sm text-white/40">
                    No news indexed for this market yet.
                </div>
            )}

            {state.status === 'ready' && state.articles.length > 0 && (
                <ul className="">
                    {state.articles.map((a) => (
                        <li key={a.id}>
                            <a
                                href={a.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 px-5 py-3 hover:bg-white/3 transition-colors group rounded-lg"
                            >
                                {a.publicationFavicon ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={a.publicationFavicon}
                                        alt=""
                                        width={35}
                                        height={35}
                                        className="mt-0.5 size-8 shrink-0 rounded-sm opacity-80"
                                        loading="lazy"
                                    />
                                ) : (
                                    <span className="mt-0.5 size-5.5 shrink-0 rounded-sm bg-white/10" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[14px] leading-snug text-white/80 line-clamp-2 group-hover:text-white">
                                        {a.title}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
                                        {a.publicationName && (
                                            <span className="truncate">{a.publicationName}</span>
                                        )}
                                        {a.publicationName && a.pubDate && <span>·</span>}
                                        {a.pubDate && <span>{format_relative(a.pubDate)}</span>}
                                    </div>
                                </div>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

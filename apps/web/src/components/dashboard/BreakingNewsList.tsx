'use client';
import { JSX, useEffect, useState } from 'react';
import type { NewsArticleDTO } from '@solmarket/types';
import { fetch_recent_news } from '@/lib/api/markets';
import SectionHeading from './SectionHeading';

const POLL_INTERVAL_MS = 5 * 60_000;

function format_relative(iso: string | null): string {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff_ms = Date.now() - t;
    if (diff_ms < 0) return '';
    const min = Math.round(diff_ms / 60_000);
    if (min < 1) return 'NOW';
    if (min < 60) return `${min}M AGO`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}H AGO`;
    const d = Math.round(hr / 24);
    return `${d}D AGO`;
}

export default function BreakingNewsList({ limit = 3 }: { limit?: number }): JSX.Element {
    const [items, set_items] = useState<NewsArticleDTO[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = () => {
            fetch_recent_news(limit).then((next) => {
                if (cancelled) return;
                set_items(next);
            });
        };
        load();
        const handle = setInterval(load, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, [limit]);

    return (
        <section className="flex flex-col min-h-0 pt-1">
            <div className="px-2">
                <SectionHeading title="Breaking News" subtitle="Live Feed" />
            </div>
            <ul className="flex-1 min-h-0 overflow-hidden">
                {items === null && (
                    <li className="px-2 py-3 text-[13px] text-white/35">Loading…</li>
                )}
                {items !== null && items.length === 0 && (
                    <li className="px-2 py-3 text-[13px] text-white/35">
                        No news yet — approve some markets to populate the feed.
                    </li>
                )}
                {items?.map((item) => (
                    <li key={item.id}>
                        <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-3 flex items-start gap-3 hover:bg-white/3 transition-colors group px-2 rounded-sm"
                        >
                            {item.publicationFavicon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={item.publicationFavicon}
                                    alt=""
                                    width={28}
                                    height={28}
                                    className="mt-0.5 size-7 shrink-0 rounded-sm opacity-80"
                                    loading="lazy"
                                />
                            ) : (
                                <span className="mt-0.5 size-7 shrink-0 rounded-sm bg-white/10" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] text-white/70 leading-snug line-clamp-2 group-hover:text-white/85 transition-colors">
                                    {item.title}
                                </p>
                                <div className="mt-1 flex items-center gap-2 text-[10px] tracking-widest uppercase text-white/35">
                                    {item.publicationName && (
                                        <span className="truncate">{item.publicationName}</span>
                                    )}
                                    {item.publicationName && item.pubDate && <span>·</span>}
                                    {item.pubDate && <span>{format_relative(item.pubDate)}</span>}
                                </div>
                            </div>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}

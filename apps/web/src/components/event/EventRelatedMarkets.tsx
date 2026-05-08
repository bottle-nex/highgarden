'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { MarketDTO } from '@solmarket/types';
import { fetchPublicMarkets } from '@/lib/api/markets';

interface Props {
    excludeId: string;
}

const TOP_N = 6;

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_end(end_at: string): string {
    const ms = new Date(end_at).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const days = Math.floor(ms / 86_400_000);
    if (days >= 30) return `${Math.floor(days / 30)}mo left`;
    if (days >= 1) return `${days}d left`;
    const hours = Math.floor(ms / 3_600_000);
    return `${hours}h left`;
}

export default function EventRelatedMarkets({ excludeId }: Props): JSX.Element | null {
    const [markets, set_markets] = useState<MarketDTO[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets().then((all) => {
            if (cancelled) return;
            const filtered = all
                .filter((m) => m.id !== excludeId)
                .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
                .slice(0, TOP_N);
            set_markets(filtered);
        });
        return () => {
            cancelled = true;
        };
    }, [excludeId]);

    if (markets.length === 0) return null;

    return (
        <section className="space-y-4">
            <h2 className="text-[10px] tracking-[0.25em] uppercase text-white/45">
                RELATED MARKETS
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {markets.map((m) => (
                    <Link
                        key={m.id}
                        href={`/event/${m.id}`}
                        className="group rounded-xl p-4 sm:p-5 bg-dark-base no-underline block hover:bg-dark-faded transition-colors"
                    >
                        <div className="flex items-start gap-3.5">
                            {m.imageUrl ? (
                                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/5">
                                    <Image
                                        src={m.imageUrl}
                                        alt=""
                                        width={48}
                                        height={48}
                                        className="w-full h-full object-cover rounded-lg"
                                    />
                                </div>
                            ) : (
                                <div className="w-12 h-12 rounded-lg bg-white/5 shrink-0" />
                            )}
                            <h3 className="text-[15px] font-medium text-white leading-snug line-clamp-3 flex-1">
                                {m.name}
                            </h3>
                        </div>

                        {m.tags.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-1.5">
                                {m.tags.slice(0, 2).map((tag) => (
                                    <span
                                        key={tag}
                                        className="text-[11px] text-white/70 bg-white/8 px-2 py-1 rounded-md"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-[12px]">
                            <div className="flex gap-4">
                                <span className="text-white/55">
                                    Vol <span className="text-white/85 font-medium">{format_usd(m.volume24hUsd)}</span>
                                </span>
                                <span className="text-white/55">
                                    Liq <span className="text-white/85 font-medium">{format_usd(m.liquidityUsd)}</span>
                                </span>
                            </div>
                            <span className="text-white/70 font-medium">{format_end(m.endAt)}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}

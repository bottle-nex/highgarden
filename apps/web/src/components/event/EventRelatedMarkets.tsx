'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import { fetchPublicMarkets } from '@/lib/api/markets';

interface Props {
    excludeId: string;
}

const TOP_N = 3;

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
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
            <h2 className=" text-[10px] tracking-[0.25em] uppercase text-white/45">
                RELATED MARKETS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {markets.map((m) => (
                    <Link
                        key={m.id}
                        href={`/event/${m.id}`}
                        className="border border-white/10 rounded-[6px] p-5 bg-neutral-950/60 hover:border-white/20 transition-colors no-underline block"
                    >
                        <h3 className="text-[14px] text-white/85 leading-snug line-clamp-2 min-h-[2.6em]">
                            {m.name}
                        </h3>
                        <div className="mt-4 pt-4 border-t border-white/8 flex items-center justify-between  text-[10px] tracking-[0.22em] uppercase">
                            <span className="text-white/45">VOL {format_usd(m.volume24hUsd)}</span>
                            <span className="text-white/30">→</span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}

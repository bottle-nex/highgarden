'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import FeaturedMarketCard from './FeaturedMarketCard';
import SectionHeading from './SectionHeading';
import { fetchPublicMarkets } from '@/lib/api/markets';
import type { FeaturedMarket } from '@/utils/constants';

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_date(iso: string): string {
    const d = new Date(iso);
    return d
        .toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        .toUpperCase();
}

function dto_to_featured(m: MarketDTO): FeaturedMarket {
    return {
        id: m.id,
        title: m.name,
        category: 'MARKET',
        description: m.description,
        // Real price-history needs the book-cache + a time-series store, neither
        // of which is wired yet. Keep the chart visually present but flat at 50.
        probabilities: synthesise_flat_series(50),
        currentProbability: 50,
        openDate: '—',
        closeDate: format_date(m.endAt),
        volume: format_usd(m.volume24hUsd),
        liquidity: format_usd(m.liquidityUsd),
        traders: 0,
        trend: 'flat',
    };
}

function synthesise_flat_series(value: number) {
    const points = 30;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return Array.from({ length: points }, (_, i) => ({
        date: new Date(now - (points - 1 - i) * day).toISOString().slice(0, 10),
        value,
    }));
}

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; market: MarketDTO | null };

export default function LiveFeaturedMarket() {
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets()
            .then((markets) => {
                if (cancelled) return;
                const sorted = [...markets].sort(
                    (a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0),
                );
                set_state({ status: 'ready', market: sorted[0] ?? null });
            })
            .catch((err) => {
                if (!cancelled) {
                    set_state({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'failed to load',
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.status === 'loading') {
        return (
            <Section>
                <Frame>Loading featured market…</Frame>
            </Section>
        );
    }

    if (state.status === 'error') {
        return (
            <Section>
                <Frame tone="error">
                    Couldn&apos;t load featured market — {state.message}.
                </Frame>
            </Section>
        );
    }

    if (!state.market) {
        return (
            <Section>
                <Frame>
                    No markets approved yet. Visit{' '}
                    <Link href="/admin" className="text-white underline-offset-2 hover:underline">
                        /admin
                    </Link>{' '}
                    to approve some.
                </Frame>
            </Section>
        );
    }

    const featured = dto_to_featured(state.market);
    return (
        <Section>
            <FeaturedMarketCard market={featured} href={`/event/${state.market.id}`} />
        </Section>
    );
}

function Section({ children }: { children: React.ReactNode }) {
    return (
        <section>
            <SectionHeading title="FEATURED MARKET" subtitle="HIGHEST VOLUME" />
            {children}
        </section>
    );
}

function Frame({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode;
    tone?: 'neutral' | 'error';
}) {
    return (
        <div
            className={`border border-dashed rounded-[6px] py-16 text-center text-sm ${
                tone === 'error'
                    ? 'border-rose-500/30 text-rose-300/80'
                    : 'border-white/10 text-white/45'
            }`}
        >
            {children}
        </div>
    );
}

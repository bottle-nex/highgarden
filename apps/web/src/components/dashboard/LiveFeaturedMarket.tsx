'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO, PriceHistoryPoint } from '@solmarket/types';
import FeaturedMarketCard from './FeaturedMarketCard';
import { fetchPublicMarkets, fetch_market_price_history } from '@/lib/api/markets';
import type { FeaturedMarket, ProbabilityPoint } from '@/utils/constants';

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

function history_to_points(history: PriceHistoryPoint[]): ProbabilityPoint[] {
    return history.map((p) => ({
        date: new Date(p.t * 1000).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        }),
        value: Math.round(p.p * 1000) / 10,
    }));
}

function synthesise_flat_series(value: number): ProbabilityPoint[] {
    const points = 30;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    return Array.from({ length: points }, (_, i) => ({
        date: new Date(now - (points - 1 - i) * day).toISOString().slice(0, 10),
        value,
    }));
}

function dto_to_featured(m: MarketDTO, history: PriceHistoryPoint[]): FeaturedMarket {
    const points = history.length > 0 ? history_to_points(history) : synthesise_flat_series(50);
    const lastP = history.length > 0 ? history[history.length - 1]!.p : 0.5;
    const firstP = history.length > 0 ? history[0]!.p : 0.5;
    const currentProbability = Math.round(lastP * 100);
    const trend =
        lastP > firstP + 0.01 ? 'up' : lastP < firstP - 0.01 ? 'down' : 'flat';

    return {
        id: m.id,
        title: m.name,
        category: 'MARKET',
        description: m.description,
        probabilities: points,
        currentProbability,
        openDate: '—',
        closeDate: format_date(m.endAt),
        volume: format_usd(m.volume24hUsd),
        liquidity: format_usd(m.liquidityUsd),
        traders: 0,
        trend,
    };
}

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; market: MarketDTO | null; history: PriceHistoryPoint[] };

export default function LiveFeaturedMarket() {
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets()
            .then(async (markets) => {
                if (cancelled) return;
                const sorted = [...markets].sort(
                    (a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0),
                );
                const market = sorted[0] ?? null;
                if (!market) {
                    set_state({ status: 'ready', market: null, history: [] });
                    return;
                }
                const dto = await fetch_market_price_history(market.id, '1w');
                if (cancelled) return;
                set_state({ status: 'ready', market, history: dto?.history ?? [] });
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
                <Frame tone="error">Couldn&apos;t load featured market — {state.message}.</Frame>
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

    const featured = dto_to_featured(state.market, state.history);
    return (
        <Section>
            <FeaturedMarketCard market={featured} href={`/event/${state.market.id}`} />
        </Section>
    );
}

function Section({ children }: { children: React.ReactNode }) {
    return (
        <section className="h-full min-h-0 flex flex-col p-1">
            <div className="flex-1 min-h-0">{children}</div>
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

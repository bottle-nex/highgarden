'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO, PriceHistoryPoint } from '@solmarket/types';
import FeaturedMarketCard from './FeaturedMarketCard';
import { fetchPublicMarkets, fetch_market_price_history } from '@/lib/api/markets';
import type { FeaturedMarket, ProbabilityPoint } from '@/utils/constants';
import { localize_market_title } from '@/utils/localize-et';

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
    const trend = lastP > firstP + 0.01 ? 'up' : lastP < firstP - 0.01 ? 'down' : 'flat';

    return {
        id: m.id,
        title: localize_market_title(m.name),
        category: 'MARKET',
        description: m.description,
        imageUrl: m.imageUrl,
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
                // The featured card is a long-form hero slot — a single 5-min
                // FAST_MOVING slot doesn't make sense there even if it wins
                // on volume. Prefer STANDARD; fall back to any market only
                // when nothing standard exists yet.
                const standard = markets.filter((m) => m.kind === 'STANDARD');
                const pool = standard.length > 0 ? standard : markets;
                const sorted = [...pool].sort(
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
                <FeaturedMarketSkeleton />
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
            className={`border border-dashed rounded-[6px] py-10 sm:py-12 lg:py-16 text-center text-sm ${
                tone === 'error'
                    ? 'border-rose-500/30 text-rose-300/80'
                    : 'border-white/10 text-white/45'
            }`}
        >
            {children}
        </div>
    );
}

function FeaturedMarketSkeleton() {
    return (
        <div
            className="relative bg-dark-base shadow-xs shadow-black/5 rounded-lg overflow-hidden h-full flex flex-col animate-pulse"
            aria-hidden
        >
            <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b border-gray-500/15 shrink-0">
                <div className="h-3 w-20 rounded-sm bg-white/10" />
                <div className="hidden md:flex items-center gap-2">
                    <div className="h-3 w-24 rounded-sm bg-white/8" />
                    <span className="text-white/15">→</span>
                    <div className="h-3 w-24 rounded-sm bg-white/8" />
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col p-5">
                <div className="flex items-start justify-between gap-6 shrink-0">
                    <div className="min-w-0 flex-1 flex items-start gap-3">
                        <div className="shrink-0 w-12 h-12 rounded-md border border-white/10 bg-white/8" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-7 w-3/4 rounded-sm bg-white/10" />
                            <div className="h-7 w-1/2 rounded-sm bg-white/10" />
                            <div className="mt-3 space-y-1.5">
                                <div className="h-3 w-full rounded-sm bg-white/6" />
                                <div className="h-3 w-2/3 rounded-sm bg-white/6" />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="h-2.5 w-16 rounded-sm bg-white/8" />
                        <div className="h-7 w-14 rounded-sm bg-white/12" />
                        <div className="h-2.5 w-20 rounded-sm bg-white/8" />
                    </div>
                </div>

                <div className="flex-1 mt-3 min-h-60 lg:min-h-0 rounded-sm bg-white/4" />

                <div className="mt-3 flex items-center gap-4 px-3 py-2 border border-white/10 rounded-[6px] bg-neutral-950 shrink-0">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-2 flex-1">
                            <div className="h-2.5 w-8 rounded-sm bg-white/8" />
                            <div className="h-2.5 w-12 rounded-sm bg-white/12" />
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex items-center gap-2 shrink-0">
                    <div className="flex-1 h-11 rounded-sm bg-white/8" />
                    <div className="flex-1 h-11 rounded-sm bg-white/8" />
                    <div className="h-9 w-9 rounded-sm bg-white/8" />
                </div>
            </div>
        </div>
    );
}

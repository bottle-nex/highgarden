'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import MarketGrid from './MarketGrid';
import SectionHeading from './SectionHeading';
import { fetchPublicMarkets } from '@/lib/api/markets';
import type { Market as CardMarket } from '@/utils/constants';
import type { Category } from '@/store/ui/useCategoryStore';
import { category_to_tags } from '@/utils/category-tags';

function format_volume(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_ends_in(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return 'ENDED';
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days >= 1) return `${days}D`;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours}H`;
}

function dto_to_card(m: MarketDTO): CardMarket {
    return {
        id: m.id,
        title: m.name,
        // Use the first Polymarket tag as the chip label (uppercased to match
        // the rest of the card's typography). Falls back to "MARKET" so the
        // card never renders an empty pill.
        category: m.tags[0]?.toUpperCase() ?? 'MARKET',
        // Neutral 50/50 until live book wiring lands.
        yesPrice: 50,
        noPrice: 50,
        volume: format_volume(m.volume24hUsd),
        change24h: 0,
        endsIn: format_ends_in(m.endAt),
    };
}

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; markets: MarketDTO[] };

interface Props {
    /** When set, the grid asks the server for markets carrying this category's
     *  tag. Acts as the page heading too. Trending / Breaking / New collapse
     *  to the unfiltered list. */
    category?: Category;
    /** When true, the featured market (highest-volume) is excluded — the
     *  trending dashboard shows it separately above the grid. */
    excludeFeatured?: boolean;
}

export default function LiveMarketGrid({ category, excludeFeatured = false }: Props = {}) {
    const tag_filter = category ? category_to_tags(category) : null;
    // Stable string key so refetches only fire on real filter changes, not on
    // every render (arrays would trigger useEffect each time).
    const tag_key = tag_filter ? tag_filter.join('|') : '';
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets(tag_filter ?? undefined)
            .then((markets) => {
                if (!cancelled) set_state({ status: 'ready', markets });
            })
            .catch((err) => {
                if (!cancelled) {
                    set_state({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'failed to load markets',
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [tag_key]); // eslint-disable-line react-hooks/exhaustive-deps

    const heading_title = category ? `${category.toUpperCase()} MARKETS` : 'ACTIVE MARKETS';
    const heading_subtitle = category && tag_filter ? 'TAGGED' : 'APPROVED';

    if (state.status === 'loading') {
        return (
            <Section title={heading_title} subtitle={heading_subtitle}>
                <MarketGridSkeleton count={excludeFeatured ? 9 : 6} showSort={!category} />
            </Section>
        );
    }

    if (state.status === 'error') {
        return (
            <Section title={heading_title} subtitle={heading_subtitle}>
                <Frame tone="error">Couldn&apos;t load markets — {state.message}.</Frame>
            </Section>
        );
    }

    // Sort by 24h volume desc. On the trending dashboard the highest-volume
    // market is shown separately as the featured card — drop it from the grid
    // there. Other category views render the full list.
    const sorted = [...state.markets].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    const grid_markets = excludeFeatured ? sorted.slice(1, 10) : sorted.slice(0, 12);

    if (grid_markets.length === 0) {
        return (
            <Section title={heading_title} subtitle={heading_subtitle}>
                <Frame>
                    {state.markets.length === 0 ? (
                        category ? (
                            <>No approved markets tagged {category} yet.</>
                        ) : (
                            <>
                                No markets approved yet. Visit{' '}
                                <Link
                                    href="/admin"
                                    className="text-white underline-offset-2 hover:underline"
                                >
                                    /admin
                                </Link>{' '}
                                to approve some from the curator dashboard.
                            </>
                        )
                    ) : (
                        'Only one market approved — see the featured card above.'
                    )}
                </Frame>
            </Section>
        );
    }

    return (
        <MarketGrid markets={grid_markets.map(dto_to_card)} get_href={(m) => `/event/${m.id}`} />
    );
}

function Section({
    children,
    title = 'ACTIVE MARKETS',
    subtitle = 'APPROVED',
}: {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
}) {
    return (
        <section>
            <SectionHeading title={title} subtitle={subtitle} />
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

function MarketGridSkeleton({ count, showSort }: { count: number; showSort: boolean }) {
    return (
        <div className="animate-pulse" aria-hidden>
            {showSort && (
                <div className="mb-5 flex items-center gap-1 border border-gray-500/15 bg-dark-base p-1 rounded-sm w-fit">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-6 w-20 rounded-xs bg-white/8" />
                    ))}
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
                {Array.from({ length: count }).map((_, i) => (
                    <MarketCardSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}

function MarketCardSkeleton() {
    return (
        <div className="rounded-lg p-5 bg-dark-base">
            <div className="flex items-center justify-between">
                <div className="h-2.5 w-16 rounded-sm bg-white/10" />
                <div className="h-2.5 w-20 rounded-sm bg-white/8" />
            </div>
            <div className="mt-5 space-y-2 min-h-12">
                <div className="h-4 w-11/12 rounded-sm bg-white/12" />
                <div className="h-4 w-2/3 rounded-sm bg-white/10" />
            </div>
            <div className="mt-6 space-y-2.5">
                {[0, 1].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="h-2.5 w-7 rounded-sm bg-white/10" />
                        <div className="flex-1 h-1.5 rounded-full bg-white/8" />
                        <div className="h-2.5 w-8 rounded-sm bg-white/10" />
                    </div>
                ))}
            </div>
            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="h-2.5 w-20 rounded-sm bg-white/10" />
                <div className="h-2.5 w-12 rounded-sm bg-white/10" />
            </div>
        </div>
    );
}

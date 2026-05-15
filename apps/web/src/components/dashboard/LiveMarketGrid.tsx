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
import { localize_market_title } from '@/utils/localize-et';
import { cadence_ms_for_series } from '@/utils/fast-series';

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
    if (hours >= 1) return `${hours}H`;
    const mins = Math.max(1, Math.floor(ms / (1000 * 60)));
    return `${mins}M`;
}

function dto_to_card(m: MarketDTO): CardMarket {
    return {
        id: m.id,
        title: localize_market_title(m.name),
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

/** Title shown on the collapsed series card — e.g. "Bitcoin Up or Down · 5m".
 *  Falls back to the representative market's name when the series key can't
 *  be parsed (defensive — derive_fast_series_key on the server already
 *  guards the slug shape). */
function series_title(series_key: string, fallback: string): string {
    const m = series_key.match(/^([a-z0-9]+)-updown-([0-9]+[a-z])$/i);
    if (!m) return fallback;
    const asset = m[1]!;
    const cadence = m[2]!;
    const display_asset = asset.charAt(0).toUpperCase() + asset.slice(1);
    return `${display_asset} Up or Down · ${cadence}`;
}


/** Collapses every FAST_MOVING market sharing a `fastSeriesKey` into a
 *  single representative card. The representative is the next-to-resolve
 *  slot, so clicking the card lands you on a market you can still trade.
 *  Standard markets and any fast-moving ones with a null series key pass
 *  through untouched. */
function collapse_fast_series(
    markets: MarketDTO[],
): Array<{ dto: MarketDTO; series?: { upcomingCount: number; title: string } }> {
    const now = Date.now();
    const buckets = new Map<string, MarketDTO[]>();
    const passthrough: MarketDTO[] = [];

    for (const m of markets) {
        if (m.kind === 'FAST_MOVING' && m.fastSeriesKey) {
            const list = buckets.get(m.fastSeriesKey) ?? [];
            list.push(m);
            buckets.set(m.fastSeriesKey, list);
        } else {
            passthrough.push(m);
        }
    }

    const out: Array<{ dto: MarketDTO; series?: { upcomingCount: number; title: string } }> = [];
    for (const m of passthrough) out.push({ dto: m });

    for (const [series_key, bucket] of buckets) {
        const upcoming = bucket
            .filter((m) => new Date(m.endAt).getTime() > now)
            .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
        // Prefer the slot that's CURRENTLY being traded — Polymarket
        // discovers slots in batches so the "earliest future endAt" can
        // be hours ahead even when a slot is live right now. We use the
        // series cadence (5m / 15m / 1h, parsed from the key) to compute
        // each slot's start and pick the one where start ≤ now < end.
        // If none qualifies (no live slot — e.g. between batches) we
        // fall back to the soonest future slot.
        const cadence_ms = cadence_ms_for_series(series_key);
        const live = cadence_ms > 0
            ? upcoming.find((m) => {
                  const end = new Date(m.endAt).getTime();
                  const start = end - cadence_ms;
                  return start <= now && now < end;
              })
            : undefined;
        const representative = live ?? upcoming[0] ?? bucket[0]!;
        out.push({
            dto: representative,
            series: {
                upcomingCount: Math.max(0, upcoming.length - 1),
                title: series_title(series_key, representative.name),
            },
        });
    }

    return out;
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
        const load = (initial: boolean) => {
            fetchPublicMarkets(tag_filter ?? undefined)
                .then((markets) => {
                    if (cancelled) return;
                    set_state({ status: 'ready', markets });
                })
                .catch((err) => {
                    if (cancelled) return;
                    // Background refresh failures are silent — the user
                    // still has the last successful snapshot. Only the
                    // initial fetch surfaces an error state.
                    if (initial) {
                        set_state({
                            status: 'error',
                            message: err instanceof Error ? err.message : 'failed to load markets',
                        });
                    }
                });
        };
        load(true);
        // The auto-lister mints new fast-moving slots every minute and
        // old ones resolve every 5. We want the series card to point at
        // the LIVE slot within a few seconds of one resolving — 20s was
        // wide enough that "go back, click card again" could still land
        // on the slot that just ended. 8s keeps the dashboard close to
        // real-time without flooding the public-list endpoint (one call
        // every 8 seconds per open tab is cheap).
        const handle = setInterval(() => load(false), 8_000);
        return () => {
            cancelled = true;
            clearInterval(handle);
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

    // Collapse FAST_MOVING ladders into one card per series BEFORE sorting,
    // so a series with 30 noisy 5-min slots doesn't dominate the grid by
    // sheer count and so the volume sort sees the representative slot's
    // numbers rather than 30 separate rows.
    const collapsed = collapse_fast_series(state.markets);

    // Sort by 24h volume desc. On the trending dashboard the highest-volume
    // market is shown separately as the featured card — drop it from the grid
    // there. Other category views render the full list.
    const sorted = [...collapsed].sort(
        (a, b) => (b.dto.volume24hUsd ?? 0) - (a.dto.volume24hUsd ?? 0),
    );
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

    // Series entries override the card title with the series label (e.g.
    // "Bitcoin Up or Down · 5m") and attach a small upcoming-count badge so
    // the user knows more slots roll in behind the currently-tradable one.
    const cards: CardMarket[] = grid_markets.map(({ dto, series }) => {
        const base = dto_to_card(dto);
        if (!series) return base;
        return {
            ...base,
            title: series.title,
            series: { upcomingCount: series.upcomingCount },
        };
    });

    return <MarketGrid markets={cards} get_href={(m) => `/event/${m.id}`} />;
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
            className={`border border-dashed rounded-[6px] py-10 sm:py-12 lg:py-16 text-center text-xs sm:text-sm ${
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
                <div className="mb-4 sm:mb-5 flex items-center gap-1 border border-gray-500/15 bg-dark-base p-1 rounded-sm w-fit">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-6 w-20 rounded-xs bg-white/8" />
                    ))}
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 xl:gap-7">
                {Array.from({ length: count }).map((_, i) => (
                    <MarketCardSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}

function MarketCardSkeleton() {
    return (
        <div className="rounded-lg p-4 sm:p-5 bg-dark-base">
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

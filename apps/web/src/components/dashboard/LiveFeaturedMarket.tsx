'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2';
import type { MarketDTO, PriceHistoryPoint } from '@solmarket/types';
import FeaturedMarketCard from './FeaturedMarketCard';
import { fetchPublicMarkets, fetch_market_price_history } from '@/lib/api/markets';
import type { FeaturedMarket, ProbabilityPoint } from '@/utils/constants';
import { localize_market_title } from '@/utils/localize-et';
import { cadence_ms_for_series } from '@/utils/fast-series';

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

interface Slide {
    market: MarketDTO;
    display_title: string;
    category: string;
}

/** Title shown on a collapsed series slide — e.g. "Bitcoin Up or Down · 5m".
 *  Mirrors the helper inlined in LiveMarketGrid so both surfaces label the
 *  same series identically. */
function series_title(series_key: string, fallback: string): string {
    const m = series_key.match(/^([a-z0-9]+)-updown-([0-9]+[a-z])$/i);
    if (!m) return fallback;
    const asset = m[1]!;
    const cadence = m[2]!;
    const display_asset = asset.charAt(0).toUpperCase() + asset.slice(1);
    return `${display_asset} Up or Down · ${cadence}`;
}

/** Collapses every FAST_MOVING market sharing a `fastSeriesKey` into one
 *  representative slot (the slot currently in-window, falling back to the
 *  soonest upcoming). Standard markets pass through. Kept inline here so
 *  the carousel doesn't depend on grid-only helpers. */
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
    const out: Array<{ dto: MarketDTO; series?: { upcomingCount: number; title: string } }> =
        passthrough.map((dto) => ({ dto }));
    for (const [series_key, bucket] of buckets) {
        const upcoming = bucket
            .filter((m) => new Date(m.endAt).getTime() > now)
            .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
        const cadence_ms = cadence_ms_for_series(series_key);
        const live = cadence_ms > 0
            ? upcoming.find((m) => {
                  const end = new Date(m.endAt).getTime();
                  return end - cadence_ms <= now && now < end;
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

/** btc-updown-5m is pinned to slot 0 per product requirement; doge-updown-5m
 *  comes next. Any other future fast series falls in after them by series-key
 *  order so the carousel stays stable across refreshes. */
function fast_priority(series_key: string | null): number {
    if (series_key === 'btc-updown-5m') return 0;
    if (series_key === 'doge-updown-5m') return 1;
    return 10;
}

/** One slide per sidebar tag-category, in sidebar order. Trending and Mentions
 *  are excluded — they're sort modes, not real Polymarket tags. */
const CATEGORY_ORDER = [
    'Politics',
    'Sports',
    'Crypto',
    'Geopolitics',
    'Culture',
    'Tech',
    'Economy',
    'Weather',
    'Elections',
] as const;

function build_slides(markets: MarketDTO[]): Slide[] {
    const collapsed = collapse_fast_series(markets);
    const fast: Slide[] = [];
    const standard: MarketDTO[] = [];
    for (const c of collapsed) {
        if (c.series) {
            fast.push({
                market: c.dto,
                display_title: c.series.title,
                category: 'FAST MARKET',
            });
        } else {
            standard.push(c.dto);
        }
    }
    fast.sort((a, b) => {
        const pa = fast_priority(a.market.fastSeriesKey);
        const pb = fast_priority(b.market.fastSeriesKey);
        if (pa !== pb) return pa - pb;
        return (a.market.fastSeriesKey ?? '').localeCompare(b.market.fastSeriesKey ?? '');
    });

    // For each sidebar category, pick the highest-volume standard market
    // whose tags include that category. Dedupe across categories — a market
    // tagged both "Politics" and "Elections" should only appear once
    // (under whichever category we hit first in CATEGORY_ORDER).
    const seen = new Set<string>();
    const category_slides: Slide[] = [];
    const tag_matches = (m: MarketDTO, tag: string) =>
        m.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    for (const category of CATEGORY_ORDER) {
        const pick = standard
            .filter((m) => !seen.has(m.id) && tag_matches(m, category))
            .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))[0];
        if (!pick) continue;
        seen.add(pick.id);
        category_slides.push({
            market: pick,
            display_title: localize_market_title(pick.name),
            category: category.toUpperCase(),
        });
    }

    return [...fast.slice(0, 3), ...category_slides];
}

function dto_to_featured(slide: Slide, history: PriceHistoryPoint[]): FeaturedMarket {
    const m = slide.market;
    const points = history.length > 0 ? history_to_points(history) : synthesise_flat_series(50);
    const lastP = history.length > 0 ? history[history.length - 1]!.p : 0.5;
    const firstP = history.length > 0 ? history[0]!.p : 0.5;
    const currentProbability = Math.round(lastP * 100);
    const trend = lastP > firstP + 0.01 ? 'up' : lastP < firstP - 0.01 ? 'down' : 'flat';

    return {
        id: m.id,
        title: slide.display_title,
        category: slide.category,
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
    | { status: 'empty' }
    | { status: 'ready'; slides: Slide[] };

export default function LiveFeaturedMarket() {
    const [state, set_state] = useState<State>({ status: 'loading' });
    const [index, set_index] = useState(0);
    const [history_cache, set_history_cache] = useState<Record<string, PriceHistoryPoint[]>>({});

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets()
            .then((markets) => {
                if (cancelled) return;
                const slides = build_slides(markets);
                if (slides.length === 0) {
                    set_state({ status: 'empty' });
                    return;
                }
                set_state({ status: 'ready', slides });
                set_index(0);
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

    // Lazy-fetch the chart for whichever slide the user is on. The cache key
    // is the market id, so flipping back to a previously-viewed slide is
    // instant. Failures land as an empty array — the card falls back to a
    // flat 50% synthesised series so layout never collapses.
    useEffect(() => {
        if (state.status !== 'ready') return;
        const slide = state.slides[index];
        if (!slide) return;
        if (history_cache[slide.market.id] !== undefined) return;
        let cancelled = false;
        fetch_market_price_history(slide.market.id, '1w').then((dto) => {
            if (cancelled) return;
            set_history_cache((prev) => ({
                ...prev,
                [slide.market.id]: dto?.history ?? [],
            }));
        });
        return () => {
            cancelled = true;
        };
    }, [state, index, history_cache]);

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

    if (state.status === 'empty') {
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

    const slide = state.slides[index]!;
    const history = history_cache[slide.market.id] ?? [];
    const featured = dto_to_featured(slide, history);
    const total = state.slides.length;
    const prev_slide = state.slides[(index - 1 + total) % total]!;
    const next_slide = state.slides[(index + 1) % total]!;
    const go_prev = () => set_index((i) => (i - 1 + total) % total);
    const go_next = () => set_index((i) => (i + 1) % total);

    return (
        <Section>
            <div className="flex-1 min-h-0">
                <FeaturedMarketCard market={featured} href={`/event/${slide.market.id}`} />
            </div>
            {total > 1 && (
                <CarouselControls
                    index={index}
                    total={total}
                    prev_title={prev_slide.display_title}
                    next_title={next_slide.display_title}
                    on_prev={go_prev}
                    on_next={go_next}
                    on_select={set_index}
                />
            )}
        </Section>
    );
}

function CarouselControls({
    index,
    total,
    prev_title,
    next_title,
    on_prev,
    on_next,
    on_select,
}: {
    index: number;
    total: number;
    prev_title: string;
    next_title: string;
    on_prev: () => void;
    on_next: () => void;
    on_select: (i: number) => void;
}) {
    return (
        <div className="mt-2 flex items-center justify-between gap-3 px-1 shrink-0">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured markets">
                {Array.from({ length: total }).map((_, i) => (
                    <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-selected={i === index}
                        aria-label={`Market ${i + 1} of ${total}`}
                        onClick={() => on_select(i)}
                        className={`h-1 rounded-full transition-all cursor-pointer ${
                            i === index
                                ? 'w-6 bg-white/80'
                                : 'w-2 bg-white/20 hover:bg-white/40'
                        }`}
                    />
                ))}
            </div>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={on_prev}
                    aria-label={`Previous market — ${prev_title}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-white/12 bg-dark-base hover:bg-white/5 text-white/70 text-[10px] tracking-[0.18em] uppercase max-w-35 sm:max-w-45 cursor-pointer"
                >
                    <HiOutlineChevronLeft className="size-3 shrink-0" />
                    <span className="truncate">{prev_title}</span>
                </button>
                <button
                    type="button"
                    onClick={on_next}
                    aria-label={`Next market — ${next_title}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-white/12 bg-dark-base hover:bg-white/5 text-white/70 text-[10px] tracking-[0.18em] uppercase max-w-35 sm:max-w-45 cursor-pointer"
                >
                    <span className="truncate">{next_title}</span>
                    <HiOutlineChevronRight className="size-3 shrink-0" />
                </button>
            </div>
        </div>
    );
}

function Section({ children }: { children: React.ReactNode }) {
    return (
        <section className="h-full min-h-0 flex flex-col p-1">
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
            className={`flex-1 min-h-0 border border-dashed rounded-[6px] py-10 sm:py-12 lg:py-16 text-center text-sm ${
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
            className="flex-1 min-h-0 relative bg-dark-base shadow-xs shadow-black/5 rounded-lg overflow-hidden flex flex-col animate-pulse"
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

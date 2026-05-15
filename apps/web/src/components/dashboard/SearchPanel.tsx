'use client';

import { JSX, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { GoStar, GoStarFill } from 'react-icons/go';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';
import type { MarketDTO } from '@solmarket/types';
import OpacityBackground from '@/components/ui/opacity-background';
import UtilityCard from '@/components/ui/utility-card';
import { fetchPublicMarkets } from '@/lib/api/markets';
import { getMarketById } from '@/utils/constants';
import { cn } from '@/lib/utils';
import { localize_market_title } from '@/utils/localize-et';
import { useSearchPanelStore } from '@/store/ui/useSearchPanelStore';
import { useBookmarksStore } from '@/store/bookmarks/useBookmarksStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; markets: MarketDTO[] };

const MAX_RESULTS = 50;
const TOP_TAGS = 4;

function resolveHref(market: MarketDTO): string {
    const detail = getMarketById(market.id);
    return detail ? `/market/${detail.slug}` : `/event/${market.id}`;
}

function formatVolume(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

interface SearchPanelProps {
    onClose: () => void;
}

export default function SearchPanel({ onClose }: SearchPanelProps): JSX.Element {
    const [state, setState] = useState<State>({ status: 'loading' });
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTag, setActiveTag] = useState<string>('All');
    const [bookmarksOnly, setBookmarksOnly] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);
    const router = useRouter();

    const query = useSearchPanelStore((s) => s.query);
    const setQuery = useSearchPanelStore((s) => s.setQuery);
    const addRecent = useSearchPanelStore((s) => s.addRecent);

    const session = useUserSessionStore((s) => s.session);
    const setOpenSigninModal = useUserSessionStore((s) => s.setOpenSigninModal);
    const bookmarkIds = useBookmarksStore((s) => s.ids);
    const toggleBookmark = useBookmarksStore((s) => s.toggle);

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets()
            .then((markets) => {
                if (!cancelled) setState({ status: 'ready', markets });
            })
            .catch((err) => {
                if (!cancelled) {
                    setState({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'failed to load markets',
                    });
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const trimmedQuery = query.trim();

    const tagOptions = useMemo<string[]>(() => {
        if (state.status !== 'ready') return ['All'];
        const counts = new Map<string, number>();
        for (const m of state.markets) {
            for (const tag of m.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        const top = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, TOP_TAGS)
            .map(([t]) => t);
        return ['All', ...top];
    }, [state]);

    const filteredMarkets = useMemo<MarketDTO[]>(() => {
        if (state.status !== 'ready') return [];
        let list = state.markets;
        if (bookmarksOnly) list = list.filter((m) => bookmarkIds.has(m.id));
        if (activeTag !== 'All') list = list.filter((m) => m.tags.includes(activeTag));
        if (trimmedQuery) {
            const q = trimmedQuery.toLowerCase();
            list = list.filter((m) => m.name.toLowerCase().includes(q));
        }
        return list.slice(0, MAX_RESULTS);
    }, [state, bookmarksOnly, activeTag, bookmarkIds, trimmedQuery]);

    // Reset highlight whenever the visible list changes — done during render
    // (instead of in an effect) so we don't trigger a cascading re-render.
    const [filterSnapshot, setFilterSnapshot] = useState({
        trimmedQuery,
        activeTag,
        bookmarksOnly,
    });
    if (
        filterSnapshot.trimmedQuery !== trimmedQuery ||
        filterSnapshot.activeTag !== activeTag ||
        filterSnapshot.bookmarksOnly !== bookmarksOnly
    ) {
        setFilterSnapshot({ trimmedQuery, activeTag, bookmarksOnly });
        setActiveIndex(0);
    }

    const effectiveActiveIndex =
        filteredMarkets.length > 0 ? Math.min(activeIndex, filteredMarkets.length - 1) : 0;

    useEffect(() => {
        rowRefs.current[effectiveActiveIndex]?.scrollIntoView({ block: 'nearest' });
    }, [effectiveActiveIndex]);

    function openMarket(market: MarketDTO) {
        addRecent(market.id);
        onClose();
        router.push(resolveHref(market));
    }

    async function handleToggleBookmark(marketId: string) {
        if (!session?.user) {
            setOpenSigninModal(true);
            return;
        }
        try {
            const next = await toggleBookmark(marketId);
            toast.success(next ? 'Bookmarked' : 'Removed bookmark');
        } catch {
            toast.error('Could not update bookmark');
        }
    }

    function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (filteredMarkets.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % filteredMarkets.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + filteredMarkets.length) % filteredMarkets.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const market = filteredMarkets[effectiveActiveIndex];
            if (market) openMarket(market);
        }
    }

    return (
        <OpacityBackground
            onBackgroundClick={onClose}
            escapeClosing
            className="bg-neutral-950/40 items-start pt-[20vh]"
        >
            <UtilityCard className="w-full max-w-xl rounded-lg border border-white/8 px-0 py-0 backdrop-blur-md overflow-hidden shadow-sm shadow-black/10">
                <div className="relative flex items-center border-b border-white/8">
                    <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/55" />
                    <input
                        ref={inputRef}
                        autoFocus
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Search markets"
                        className="w-full h-12 bg-transparent pl-11 pr-12 text-[13px] text-white/85 placeholder:text-white/35 outline-none focus:outline-none focus:ring-0"
                    />
                    <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex h-5 min-w-8 px-1.5 items-center justify-center bg-white/5 rounded-sm text-[10px] tracking-wider text-white/45">
                        ESC
                    </kbd>
                </div>
                <div className="flex items-center gap-1 border-b border-white/8 px-2 py-2">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {tagOptions.map((tag) => {
                            const active = !bookmarksOnly && activeTag === tag;
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setActiveTag(tag)}
                                    className={cn(
                                        'h-7 px-3 rounded-sm text-[12px] whitespace-nowrap cursor-pointer transition-colors',
                                        active
                                            ? 'bg-white/10 text-white'
                                            : 'text-white/55 hover:text-white/80 hover:bg-white/5',
                                    )}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={() => setBookmarksOnly((v) => !v)}
                        data-pressed={bookmarksOnly}
                        aria-label="Show bookmarked markets only"
                        title="Show bookmarked markets only"
                        className={cn(
                            'ml-auto flex items-center justify-center size-7 rounded-sm cursor-pointer transition-colors',
                            bookmarksOnly
                                ? 'bg-white/10 text-yellow-300'
                                : 'text-white/45 hover:text-white/80 hover:bg-white/5',
                        )}
                    >
                        {bookmarksOnly ? (
                            <GoStarFill className="size-4" />
                        ) : (
                            <GoStar className="size-4" />
                        )}
                    </button>
                </div>

                <div className="max-h-96 overflow-y-auto px-1 py-1">
                    {state.status === 'loading' && <Empty>Loading markets…</Empty>}
                    {state.status === 'error' && (
                        <Empty tone="error">Couldn&apos;t load markets — {state.message}.</Empty>
                    )}

                    {state.status === 'ready' && filteredMarkets.length === 0 && (
                        <Empty>
                            {bookmarksOnly
                                ? 'No bookmarked markets match your filters.'
                                : trimmedQuery
                                  ? `No markets match "${trimmedQuery}".`
                                  : 'No markets available.'}
                        </Empty>
                    )}

                    {state.status === 'ready' &&
                        filteredMarkets.map((m, i) => (
                            <ResultRow
                                key={m.id}
                                ref={(el) => {
                                    rowRefs.current[i] = el;
                                }}
                                market={m}
                                active={i === effectiveActiveIndex}
                                bookmarked={bookmarkIds.has(m.id)}
                                onHover={() => setActiveIndex(i)}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    openMarket(m);
                                }}
                                onToggleBookmark={() => void handleToggleBookmark(m.id)}
                            />
                        ))}
                </div>
            </UtilityCard>
        </OpacityBackground>
    );
}

function ResultRow({
    market,
    active,
    bookmarked,
    onHover,
    onSelect,
    onToggleBookmark,
    ref,
}: {
    market: MarketDTO;
    active: boolean;
    bookmarked: boolean;
    onHover: () => void;
    onSelect: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    onToggleBookmark: () => void;
    ref?: React.Ref<HTMLAnchorElement>;
}): JSX.Element {
    return (
        <Link
            ref={ref}
            href={resolveHref(market)}
            onMouseEnter={onHover}
            onClick={onSelect}
            className={cn(
                'group flex items-center gap-3 px-3 py-2  transition-colors no-underline rounded-sm',
                active ? 'bg-white/8' : 'bg-transparent',
            )}
        >
            <MarketLogo src={market.imageUrl} alt={market.name} />
            <span className="flex-1 min-w-0 text-[13px] text-white/85 line-clamp-1">
                {localize_market_title(market.name)}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-white/70">
                {formatVolume(market.volume24hUsd)}
            </span>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleBookmark();
                }}
                data-pressed={bookmarked}
                aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
                className={cn(
                    'shrink-0 p-1 rounded-sm cursor-pointer transition-colors',
                    bookmarked ? 'text-yellow-300' : 'text-white/30 hover:text-white/80',
                )}
            >
                {bookmarked ? <GoStarFill className="size-3.5" /> : <GoStar className="size-3.5" />}
            </button>
        </Link>
    );
}

function MarketLogo({ src, alt }: { src: string | null; alt: string }): JSX.Element {
    if (!src) {
        return (
            <span
                aria-hidden
                className="size-7.5 shrink-0 bg-white/5 rounded-sm flex items-center justify-center text-[10px] text-white/30"
            >
                {alt.slice(0, 1).toUpperCase()}
            </span>
        );
    }
    // Plain <img> — market images come from arbitrary upstream hosts,
    // so we sidestep next/image's remotePatterns allowlist for the panel.
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-7.5 shrink-0 rounded-sm object-cover bg-white/5" />
    );
}

function Empty({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode;
    tone?: 'neutral' | 'error';
}): JSX.Element {
    return (
        <div
            className={cn(
                'px-4 py-10 text-center text-[12px]',
                tone === 'error' ? 'text-rose-300/80' : 'text-white/45',
            )}
        >
            {children}
        </div>
    );
}

'use client';

import { JSX, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';
import { RxCross2 } from 'react-icons/rx';
import type { MarketDTO } from '@solmarket/types';
import OpacityBackground from '../ui/opacity-background';
import UtilityCard from '../ui/utility-card';
import { fetchPublicMarkets } from '@/lib/api/markets';
import { getMarketById } from '@/utils/constants';
import { cn } from '@/lib/utils';
import { useSearchPanelStore } from '@/store/ui/useSearchPanelStore';

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; markets: MarketDTO[] };

const MAX_RESULTS = 50;
const RECENTS_DISPLAY = 2;
const EXPLORE_DISPLAY = 4;

function resolveHref(market: MarketDTO): string {
    const detail = getMarketById(market.id);
    return detail ? `/market/${detail.slug}` : `/event/${market.id}`;
}

export default function SearchPanel({ onClose }: { onClose: () => void }): JSX.Element {
    const [state, setState] = useState<State>({ status: 'loading' });
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const rowRefs = useRef<Array<HTMLAnchorElement | null>>([]);
    const router = useRouter();

    const recentIds = useSearchPanelStore((s) => s.recents);
    const addRecent = useSearchPanelStore((s) => s.addRecent);
    const removeRecent = useSearchPanelStore((s) => s.removeRecent);

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
    const isSearching = trimmedQuery.length > 0;

    const searchResults = useMemo(() => {
        if (state.status !== 'ready' || !isSearching) return [];
        const q = trimmedQuery.toLowerCase();
        return state.markets.filter((m) => m.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
    }, [state, isSearching, trimmedQuery]);

    const recentMarkets = useMemo(() => {
        if (state.status !== 'ready' || isSearching) return [];
        const byId = new Map(state.markets.map((m) => [m.id, m]));
        return recentIds
            .map((id) => byId.get(id))
            .filter((m): m is MarketDTO => Boolean(m))
            .slice(0, RECENTS_DISPLAY);
    }, [state, recentIds, isSearching]);

    const exploreMarkets = useMemo(() => {
        if (state.status !== 'ready' || isSearching) return [];
        const recentSet = new Set(recentMarkets.map((m) => m.id));
        return state.markets.filter((m) => !recentSet.has(m.id)).slice(0, EXPLORE_DISPLAY);
    }, [state, recentMarkets, isSearching]);

    const navigableItems = useMemo<MarketDTO[]>(
        () => (isSearching ? searchResults : [...recentMarkets, ...exploreMarkets]),
        [isSearching, searchResults, recentMarkets, exploreMarkets],
    );

    const effectiveActiveIndex =
        navigableItems.length > 0 ? Math.min(activeIndex, navigableItems.length - 1) : 0;

    // Keep the active row in view when keyboard nav scrolls past the visible area.
    useEffect(() => {
        rowRefs.current[effectiveActiveIndex]?.scrollIntoView({ block: 'nearest' });
    }, [effectiveActiveIndex]);

    function openMarket(market: MarketDTO) {
        addRecent(market.id);
        onClose();
        router.push(resolveHref(market));
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (navigableItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % navigableItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + navigableItems.length) % navigableItems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const market = navigableItems[effectiveActiveIndex];
            if (market) openMarket(market);
        }
    }

    return (
        <OpacityBackground
            onBackgroundClick={onClose}
            escapeClosing
            className="bg-neutral-950/40 items-start pt-[20vh]"
        >
            <UtilityCard className="w-full max-w-xl rounded-lg border border-white/10 px-0 py-0 backdrop-blur-md">
                <div className="relative flex items-center border-b border-white/10">
                    <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/55" />
                    <input
                        autoFocus
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search markets"
                        className="w-full h-12 bg-transparent pl-11 pr-12 text-[13px] text-white/85 placeholder:text-white/35 outline-none focus:outline-none focus:ring-0"
                    />
                    <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex h-5 min-w-8 px-1.5 items-center justify-center bg-white/5 rounded-sm text-[10px] tracking-wider text-white/45">
                        ESC
                    </kbd>
                </div>

                <div className="max-h-110 overflow-y-auto px-1 py-1">
                    {state.status === 'loading' && <Empty>Loading markets…</Empty>}
                    {state.status === 'error' && (
                        <Empty tone="error">Couldn&apos;t load markets — {state.message}.</Empty>
                    )}

                    {state.status === 'ready' && isSearching && searchResults.length === 0 && (
                        <Empty>No markets match &ldquo;{trimmedQuery}&rdquo;.</Empty>
                    )}

                    {state.status === 'ready' &&
                        isSearching &&
                        searchResults.map((m, i) => (
                            <ResultRow
                                key={m.id}
                                ref={(el) => {
                                    rowRefs.current[i] = el;
                                }}
                                market={m}
                                active={i === effectiveActiveIndex}
                                onHover={() => setActiveIndex(i)}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    openMarket(m);
                                }}
                            />
                        ))}

                    {state.status === 'ready' && !isSearching && (
                        <>
                            {recentMarkets.length > 0 && (
                                <>
                                    <SectionHeader>Recents</SectionHeader>
                                    {recentMarkets.map((m, i) => (
                                        <ResultRow
                                            key={m.id}
                                            ref={(el) => {
                                                rowRefs.current[i] = el;
                                            }}
                                            market={m}
                                            active={i === effectiveActiveIndex}
                                            onHover={() => setActiveIndex(i)}
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                openMarket(m);
                                            }}
                                            onRemove={() => removeRecent(m.id)}
                                        />
                                    ))}
                                </>
                            )}

                            {exploreMarkets.length > 0 && (
                                <>
                                    <SectionHeader>Explore</SectionHeader>
                                    {exploreMarkets.map((m, i) => {
                                        const idx = recentMarkets.length + i;
                                        return (
                                            <ResultRow
                                                key={m.id}
                                                ref={(el) => {
                                                    rowRefs.current[idx] = el;
                                                }}
                                                market={m}
                                                active={idx === effectiveActiveIndex}
                                                onHover={() => setActiveIndex(idx)}
                                                onSelect={(e) => {
                                                    e.preventDefault();
                                                    openMarket(m);
                                                }}
                                            />
                                        );
                                    })}
                                </>
                            )}

                            {recentMarkets.length === 0 && exploreMarkets.length === 0 && (
                                <Empty>No markets available.</Empty>
                            )}
                        </>
                    )}
                </div>
            </UtilityCard>
        </OpacityBackground>
    );
}

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
    return (
        <div className="px-3 pt-3 pb-1 text-[12px] tracking-wider text-gray-400/60">{children}</div>
    );
}

function ResultRow({
    market,
    active,
    onHover,
    onSelect,
    onRemove,
    ref,
}: {
    market: MarketDTO;
    active: boolean;
    onHover: () => void;
    onSelect: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    onRemove?: () => void;
    ref?: React.Ref<HTMLAnchorElement>;
}): JSX.Element {
    return (
        <Link
            ref={ref}
            href={resolveHref(market)}
            onMouseEnter={onHover}
            onClick={onSelect}
            className={cn(
                'relative flex items-center gap-3 px-4 py-2.5 transition-colors no-underline rounded-sm',
                active ? 'bg-white/8' : 'bg-transparent',
                onRemove ? 'pr-10' : '',
            )}
        >
            <MarketLogo src={market.imageUrl} alt={market.name} />
            <span className="flex-1 text-[13px] text-white/80 line-clamp-1">{market.name}</span>
            {onRemove && (
                <button
                    type="button"
                    title="Remove from recents"
                    aria-label="Remove from recents"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/80 cursor-pointer"
                >
                    <RxCross2 className="size-3.5" />
                </button>
            )}
        </Link>
    );
}

function MarketLogo({ src, alt }: { src: string | null; alt: string }): JSX.Element {
    if (!src) {
        return (
            <span
                aria-hidden
                className="size-8 shrink-0 bg-white/5 rounded-sm flex items-center justify-center text-[10px] text-white/30"
            >
                {alt.slice(0, 1).toUpperCase()}
            </span>
        );
    }
    // Plain <img> — market images come from arbitrary upstream hosts,
    // so we sidestep next/image's remotePatterns allowlist for the panel.
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-8 shrink-0 rounded-sm object-cover bg-white/5" />
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

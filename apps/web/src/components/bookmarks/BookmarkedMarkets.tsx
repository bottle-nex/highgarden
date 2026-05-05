'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import type { MarketDTO } from '@solmarket/types';
import MarketCard from '@/components/dashboard/MarketCard';
import SectionHeading from '@/components/dashboard/SectionHeading';
import { fetch_bookmarked_markets } from '@/lib/api/bookmarks';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useBookmarksStore } from '@/store/bookmarks/useBookmarksStore';
import type { Market as CardMarket } from '@/utils/constants';

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
        category: m.tags[0]?.toUpperCase() ?? 'MARKET',
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

export default function BookmarkedMarkets(): JSX.Element {
    const session = useUserSessionStore((s) => s.session);
    const setOpenSigninModal = useUserSessionStore((s) => s.setOpenSigninModal);
    // Re-fetch whenever the user toggles a bookmark on this page so the list
    // stays in sync with the optimistic store update.
    const id_count = useBookmarksStore((s) => s.ids.size);
    const toggle_bookmark = useBookmarksStore((s) => s.toggle);
    const [state, set_state] = useState<State>({ status: 'loading' });
    const [removing_id, set_removing_id] = useState<string | null>(null);

    const handle_remove = async (market_id: string) => {
        if (removing_id) return;
        // Mark the card as "removing" so it pulses while the API call is in
        // flight. We deliberately keep the card in `state.markets` until the
        // request resolves — the pulse runs for exactly the loading duration,
        // then the card is dropped and AnimatePresence runs the exit anim.
        set_removing_id(market_id);
        try {
            await toggle_bookmark(market_id);
            set_state((prev) => {
                if (prev.status !== 'ready') return prev;
                return {
                    status: 'ready',
                    markets: prev.markets.filter((m) => m.id !== market_id),
                };
            });
        } catch {
            toast.error('Could not remove bookmark');
        } finally {
            set_removing_id(null);
        }
    };

    useEffect(() => {
        if (!session?.user) return;
        let cancelled = false;
        fetch_bookmarked_markets()
            .then((markets) => {
                if (!cancelled) set_state({ status: 'ready', markets });
            })
            .catch((err) => {
                if (!cancelled) {
                    set_state({
                        status: 'error',
                        message: err instanceof Error ? err.message : 'failed to load bookmarks',
                    });
                }
            });
        return () => {
            cancelled = true;
        };
        // id_count triggers a refetch when bookmarks toggle elsewhere.
    }, [session?.user, id_count]);

    if (!session?.user) {
        return (
            <Section>
                <Frame>
                    <p className="mb-4">Sign in to see your bookmarked markets.</p>
                    <button
                        type="button"
                        onClick={() => setOpenSigninModal(true)}
                        className="h-9 px-5 rounded-md border border-white/15 hover:bg-white/5 text-[10px] tracking-[0.3em] uppercase text-white/70 hover:text-white transition-colors cursor-pointer"
                    >
                        SIGN IN
                    </button>
                </Frame>
            </Section>
        );
    }

    if (state.status === 'loading') {
        return (
            <Section>
                <Frame>Loading bookmarks…</Frame>
            </Section>
        );
    }

    if (state.status === 'error') {
        return (
            <Section>
                <Frame tone="error">Couldn&apos;t load bookmarks — {state.message}.</Frame>
            </Section>
        );
    }

    if (state.markets.length === 0) {
        return (
            <Section>
                <Frame>
                    No bookmarks yet. Open a{' '}
                    <Link
                        href="/dashboard"
                        className="text-white underline-offset-2 hover:underline"
                    >
                        market
                    </Link>{' '}
                    and tap the bookmark icon to save it here.
                </Frame>
            </Section>
        );
    }

    return (
        <Section>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
                <AnimatePresence initial={false}>
                    {state.markets.map((m) => {
                        const card_market = dto_to_card(m);
                        const is_removing = removing_id === m.id;
                        return (
                            <motion.div
                                key={m.id}
                                layout
                                initial={{ opacity: 1, scale: 1 }}
                                animate={
                                    is_removing
                                        ? {
                                              // Slow, ease-in-out opacity sweep
                                              // keeps cycling for as long as
                                              // the API call is pending.
                                              opacity: [1, 0.4, 1],
                                              transition: {
                                                  duration: 1.6,
                                                  repeat: Infinity,
                                                  ease: 'easeInOut',
                                              },
                                          }
                                        : { opacity: 1, scale: 1, transition: { duration: 0.2 } }
                                }
                                exit={{
                                    opacity: 0,
                                    scale: 0.96,
                                    transition: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
                                }}
                            >
                                <MarketCard
                                    market={card_market}
                                    href={`/event/${m.id}`}
                                    overlay={
                                        <button
                                            type="button"
                                            disabled={is_removing}
                                            onClick={(e) => {
                                                // The card itself is a <Link>;
                                                // stop the click from bubbling
                                                // up and navigating away.
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void handle_remove(m.id);
                                            }}
                                            className="red-btn rounded-sm px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase text-white disabled:opacity-60 cursor-pointer"
                                        >
                                            {is_removing ? 'Removing' : 'Remove'}
                                        </button>
                                    }
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </Section>
    );
}

function Section({ children }: { children: React.ReactNode }) {
    return (
        <section>
            <SectionHeading title="BOOKMARKED" subtitle="SAVED" />
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

'use client';

import { JSX, useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import MarketGrid from '@/components/dashboard/MarketGrid';
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
    const [state, set_state] = useState<State>({ status: 'loading' });

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
        <MarketGrid
            markets={state.markets.map(dto_to_card)}
            get_href={(m) => `/event/${m.id}`}
            show_sort={false}
        />
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

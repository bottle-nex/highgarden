'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import StakingSection from './StakingSection';
import SectionHeading from './SectionHeading';
import { fetchPublicMarkets } from '@/lib/api/markets';
import type { YesNoMarket } from '@/utils/constants';

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

function dto_to_yes_no_market(m: MarketDTO): YesNoMarket {
    return {
        id: m.id,
        title: m.name,
        category: 'MARKET',
        // Static 50/50 until live book hydration is wired into the dashboard.
        yesPrice: 50,
        noPrice: 50,
        volume: format_volume(m.volume24hUsd),
        traders: 0,
        change24h: 0,
        endsIn: format_ends_in(m.endAt),
        description: m.description,
        imageUrl: m.imageUrl,
    };
}

type State =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; markets: MarketDTO[] };

export default function LiveStakingSection() {
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetchPublicMarkets()
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
    }, []);

    if (state.status === 'loading') {
        return (
            <Section>
                <Frame>Loading markets…</Frame>
            </Section>
        );
    }

    if (state.status === 'error') {
        return (
            <Section>
                <Frame tone="error">Couldn&apos;t load markets — {state.message}.</Frame>
            </Section>
        );
    }

    if (state.markets.length === 0) {
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

    const yes_no = state.markets.map(dto_to_yes_no_market);

    return (
        <StakingSection yesNoMarkets={yes_no} multiCandidateMarkets={[]} multiOptionMarkets={[]} />
    );
}
function Section({ children }: { children: React.ReactNode }) {
    return (
        <section>
            <SectionHeading title="STAKE ON OUTCOMES" subtitle="PREDICTION MARKETS" />
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

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MarketDTO } from '@solmarket/types';
import { fetch_market_by_id } from '@/lib/api/markets';

function format_usd(usd: number | null): string {
    if (usd === null) return '—';
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
}

function format_date(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

function truncate(s: string, head = 8, tail = 8): string {
    if (s.length <= head + tail + 1) return s;
    return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

type State =
    | { status: 'loading' }
    | { status: 'not_found' }
    | { status: 'ready'; market: MarketDTO };

export default function EventDetail({ id }: { id: string }) {
    const [state, set_state] = useState<State>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetch_market_by_id(id).then((m) => {
            if (cancelled) return;
            set_state(m ? { status: 'ready', market: m } : { status: 'not_found' });
        });
        return () => {
            cancelled = true;
        };
    }, [id]);

    return (
        <div className="min-h-screen w-full bg-dark-base text-white/80">
            <header className="sticky top-0 z-40 w-full bg-dark-alpha backdrop-blur-sm border-b border-white/8">
                <div className="mx-auto w-full max-w-360 h-16 px-6 lg:px-8 flex items-center justify-between">
                    <Link
                        href="/dashboard"
                        className="text-[10px] tracking-[0.25em] uppercase text-white/55 hover:text-white"
                    >
                        ← Back to dashboard
                    </Link>
                    <span className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                        EVENT
                    </span>
                </div>
            </header>

            <main className="mx-auto w-full max-w-360 px-6 lg:px-8 py-12">
                {state.status === 'loading' && <Frame>Loading market…</Frame>}
                {state.status === 'not_found' && (
                    <Frame>
                        Market not found. It may not be approved yet, or the link is wrong.
                    </Frame>
                )}
                {state.status === 'ready' && <Body market={state.market} />}
            </main>
        </div>
    );
}

function Body({ market }: { market: MarketDTO }) {
    return (
        <div className="space-y-10">
            <header className="space-y-4">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/40">
                    Polymarket #{market.polyMarketId}
                </span>
                <h1 className="text-3xl text-white leading-tight font-medium">{market.name}</h1>
                {market.description && (
                    <p className="text-sm text-white/55 leading-relaxed max-w-3xl">
                        {market.description}
                    </p>
                )}
            </header>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border border-white/10 rounded-[6px] overflow-hidden">
                <Stat label="ENDS" value={format_date(market.endAt)} />
                <Stat label="24H VOLUME" value={format_usd(market.volume24hUsd)} />
                <Stat label="LIQUIDITY" value={format_usd(market.liquidityUsd)} />
                <Stat label="TICK SIZE" value={market.tickSize} />
            </section>

            <section className="border border-white/10 rounded-[6px] p-6 space-y-4">
                <h2 className="text-[11px] tracking-[0.25em] uppercase text-white/55">
                    Identifiers
                </h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 text-xs">
                    <Row label="YES token" value={truncate(market.yesTokenId)} />
                    <Row label="NO token" value={truncate(market.noTokenId)} />
                    <Row
                        label="Solana market PDA"
                        value={market.solanaMarketPda ? truncate(market.solanaMarketPda) : '—'}
                    />
                    <Row label="Negative-risk" value={market.negRisk ? 'yes' : 'no'} />
                </dl>
            </section>

            <section className="border border-dashed border-white/10 rounded-[6px] py-12 text-center text-sm text-white/40">
                Trade panel coming soon. Live order book + buy/sell flow lands when the quote
                endpoint and wallet adapter are wired.
            </section>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-neutral-950 px-5 py-4">
            <div className="font-mono text-[10px] tracking-[0.22em] text-white/45 uppercase">
                {label}
            </div>
            <div className="mt-2 text-base tabular-nums text-white/80">{value}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
            <dt className="text-white/45">{label}</dt>
            <dd className="text-white/80 font-mono">{value}</dd>
        </div>
    );
}

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div className="border border-dashed border-white/10 rounded-[6px] py-20 text-center text-sm text-white/45">
            {children}
        </div>
    );
}

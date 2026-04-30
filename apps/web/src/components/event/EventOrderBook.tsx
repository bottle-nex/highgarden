'use client';

import { JSX, useState } from 'react';
import { Outcome } from '@solmarket/types';
import { useOrderBook } from '@/lib/socket/useOrderBook';

interface Props {
    marketId: string;
    selectedOutcome: Outcome;
    onOutcomeChange: (o: Outcome) => void;
}

const VISIBLE_LEVELS = 10;

function format_cents(price: number): string {
    return `${(price * 100).toFixed(1)}¢`;
}

function format_size(size: number): string {
    if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(2)}M`;
    if (size >= 1_000) return `${(size / 1_000).toFixed(2)}K`;
    return size.toFixed(0);
}

function format_total(price: number, size: number): string {
    const usd = price * size;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`;
    return `$${usd.toFixed(0)}`;
}

export default function EventOrderBook({
    marketId,
    selectedOutcome,
    onOutcomeChange,
}: Props): JSX.Element {
    const [is_open, set_is_open] = useState(true);
    const book = useOrderBook(marketId, selectedOutcome);

    const bids = book.bids.slice(0, VISIBLE_LEVELS);
    const asks = book.asks.slice(0, VISIBLE_LEVELS);
    const max_bid_total = book.cumulativeBids[bids.length - 1] ?? 0;
    const max_ask_total = book.cumulativeAsks[asks.length - 1] ?? 0;
    const max_total = Math.max(max_bid_total, max_ask_total, 1);

    return (
        <section className="border border-white/10 rounded-[6px] bg-neutral-950/60">
            <header className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <button
                    type="button"
                    onClick={() => set_is_open((v) => !v)}
                    className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/65 hover:text-white cursor-pointer"
                >
                    <span
                        className={`inline-block w-2 h-2 transition-transform ${
                            is_open ? 'rotate-90' : ''
                        }`}
                    >
                        ▸
                    </span>
                    ORDER BOOK
                </button>
                <div className="flex gap-1 bg-white/[0.02] border border-white/10 rounded-md p-[3px]">
                    {[Outcome.YES, Outcome.NO].map((o) => (
                        <button
                            key={o}
                            type="button"
                            onClick={() => onOutcomeChange(o)}
                            className={`px-3 py-1 rounded text-[9px] tracking-[0.2em] uppercase font-mono transition-colors cursor-pointer ${
                                selectedOutcome === o
                                    ? o === Outcome.YES
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-rose-500/15 text-rose-300'
                                    : 'text-white/45 hover:text-white/75'
                            }`}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            </header>

            {is_open && (
                <div className="px-5 py-4">
                    <div className="grid grid-cols-3 gap-4 font-mono text-[9px] tracking-[0.22em] uppercase text-white/35 pb-3 border-b border-white/8">
                        <span>PRICE</span>
                        <span className="text-right">SHARES</span>
                        <span className="text-right">TOTAL</span>
                    </div>

                    {!book.isHydrated && (
                        <div className="py-8 text-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                            Loading book…
                        </div>
                    )}

                    {book.isHydrated && book.status === 'NOT_TRACKED' && (
                        <div className="py-8 text-center space-y-3">
                            <div className="text-[10px] tracking-[0.25em] uppercase text-amber-300/70">
                                Market data starting up
                            </div>
                            <div className="text-[11px] text-white/45">
                                The mirror is being notified now. Refresh in a few seconds.
                            </div>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="mt-1 px-4 py-1.5 rounded-md border border-white/10 hover:border-white/25 font-mono text-[10px] tracking-[0.25em] uppercase text-white/65 hover:text-white cursor-pointer"
                            >
                                RETRY
                            </button>
                        </div>
                    )}

                    {book.isHydrated &&
                        book.status !== 'NOT_TRACKED' &&
                        asks.length === 0 &&
                        bids.length === 0 && (
                            <div className="py-8 text-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                                No open orders
                            </div>
                        )}

                    {book.isHydrated && (asks.length > 0 || bids.length > 0) && (
                        <>
                            <div className="pt-2 space-y-[3px]">
                                {asks
                                    .map((lvl, i) => {
                                        const cum = book.cumulativeAsks[i] ?? lvl.size;
                                        const w = (cum / max_total) * 100;
                                        return (
                                            <div
                                                key={`ask-${lvl.price}`}
                                                className="relative grid grid-cols-3 gap-4 py-1 font-mono text-[11px] tabular-nums"
                                            >
                                                <div
                                                    className="absolute inset-y-0 right-0 bg-rose-500/10 rounded-sm"
                                                    style={{ width: `${w}%` }}
                                                />
                                                <span className="relative text-rose-300/85">
                                                    {format_cents(lvl.price)}
                                                </span>
                                                <span className="relative text-right text-white/60">
                                                    {format_size(lvl.size)}
                                                </span>
                                                <span className="relative text-right text-white/45">
                                                    {format_total(lvl.price, lvl.size)}
                                                </span>
                                            </div>
                                        );
                                    })
                                    .reverse()}
                            </div>

                            <div className="my-3 px-2 py-2 flex items-center justify-between bg-white/[0.02] border-y border-white/8 font-mono text-[10px] tracking-[0.22em] uppercase">
                                <span className="text-white/55">SPREAD</span>
                                <span className="text-white/85 tabular-nums">
                                    {book.spread !== null
                                        ? `${(book.spread * 100).toFixed(2)}¢`
                                        : '—'}
                                </span>
                            </div>

                            <div className="space-y-[3px]">
                                {bids.map((lvl, i) => {
                                    const cum = book.cumulativeBids[i] ?? lvl.size;
                                    const w = (cum / max_total) * 100;
                                    return (
                                        <div
                                            key={`bid-${lvl.price}`}
                                            className="relative grid grid-cols-3 gap-4 py-1 font-mono text-[11px] tabular-nums"
                                        >
                                            <div
                                                className="absolute inset-y-0 right-0 bg-emerald-500/10 rounded-sm"
                                                style={{ width: `${w}%` }}
                                            />
                                            <span className="relative text-emerald-300/85">
                                                {format_cents(lvl.price)}
                                            </span>
                                            <span className="relative text-right text-white/60">
                                                {format_size(lvl.size)}
                                            </span>
                                            <span className="relative text-right text-white/45">
                                                {format_total(lvl.price, lvl.size)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </section>
    );
}

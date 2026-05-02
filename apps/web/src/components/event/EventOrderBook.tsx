'use client';

import { JSX, useCallback, useRef, useState } from 'react';
import { VscLayoutCentered } from 'react-icons/vsc';
import { Outcome } from '@solmarket/types';
import { useOrderBook } from '@/lib/socket/useOrderBook';
import { Button } from '@/components/ui/button';
import ToolTipComponent from '@/components/utility/ToolTipComponent';

interface Props {
    marketId: string;
    selectedOutcome: Outcome;
    onOutcomeChange: (o: Outcome) => void;
}

const VISIBLE_LEVELS = 10;

function format_cents(price: number): string {
    const cents = price * 100;
    const rounded = Math.round(cents * 10) / 10;
    // Drop the trailing ".0" so 18.0¢ renders as 18¢, like Polymarket.
    const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
    return `${text}¢`;
}

function format_size(size: number): string {
    return size.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function format_total(price: number, size: number): string {
    const usd = price * size;
    return `$${usd.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default function EventOrderBook({
    marketId,
    selectedOutcome,
    onOutcomeChange,
}: Props): JSX.Element {
    const [is_open, set_is_open] = useState(true);
    const book = useOrderBook(marketId, selectedOutcome);
    const scroll_ref = useRef<HTMLDivElement | null>(null);
    const spread_ref = useRef<HTMLDivElement | null>(null);

    const center_book = useCallback(() => {
        const container = scroll_ref.current;
        const spread = spread_ref.current;
        if (!container || !spread) return;
        const container_rect = container.getBoundingClientRect();
        const spread_rect = spread.getBoundingClientRect();
        const offset_within_container = spread_rect.top - container_rect.top + container.scrollTop;
        const target =
            offset_within_container - container.clientHeight / 2 + spread_rect.height / 2;
        container.scrollTo({ top: target, behavior: 'smooth' });
    }, []);

    const bids = book.bids.slice(0, VISIBLE_LEVELS);
    const asks = book.asks.slice(0, VISIBLE_LEVELS);
    const max_bid_total = book.cumulativeBids[bids.length - 1] ?? 0;
    const max_ask_total = book.cumulativeAsks[asks.length - 1] ?? 0;
    const max_total = Math.max(max_bid_total, max_ask_total, 1);

    return (
        <section className="border border-white/10 rounded-[8px] bg-dark-base overflow-hidden">
            <header
                onClick={() => set_is_open((v) => !v)}
                className={`group flex items-center justify-between px-7 py-5 border-white/7 cursor-pointer select-none transition-colors ${
                    is_open ? 'border-b bg-dark-alpha' : 'bg-dark-base'
                }`}
            >
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        set_is_open((v) => !v);
                    }}
                    className="flex items-center gap-3 text-[10px] tracking-[0.32em] uppercase text-white/70 group-hover:text-white cursor-pointer"
                >
                    <span
                        className={`inline-block w-2.5 text-white/45 group-hover:text-white/70 transition-transform duration-200 ${
                            is_open ? 'rotate-90' : ''
                        }`}
                    >
                        ▸
                    </span>
                    <span className="font-medium">Order Book</span>
                </button>
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                    <ToolTipComponent content="Recenter book">
                        <Button
                            type="button"
                            size="icon-sm"
                            onClick={center_book}
                            aria-label="Center order book"
                            className="text-white/55 hover:text-white"
                        >
                            <VscLayoutCentered className="rotate-90" />
                        </Button>
                    </ToolTipComponent>
                    <div className="flex gap-1 bg-white/2.5 border border-white/8 rounded-md p-0.75">
                        {[Outcome.YES, Outcome.NO].map((o) => (
                            <button
                                key={o}
                                type="button"
                                onClick={() => onOutcomeChange(o)}
                                className={`px-3.5 py-1.5 rounded text-[9.5px] tracking-[0.28em] uppercase font-medium transition-colors cursor-pointer ${
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
                </div>
            </header>

            <div
                className={`overflow-hidden [overflow-anchor:none] transition-[max-height] duration-300 ease-in-out ${
                    is_open ? 'max-h-130' : 'max-h-0'
                }`}
            >
                <div>
                    <div className="py-6">
                        <div className="grid grid-cols-3 gap-x-10 pr-5 text-[9.5px] tracking-[0.32em] uppercase text-white/35 pb-4 border-b border-white/7">
                            <span className="text-right">Price</span>
                            <span className="text-right">Shares</span>
                            <span className="text-right">Total</span>
                        </div>

                        {!book.isHydrated && (
                            <div className="py-12 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                                Loading book…
                            </div>
                        )}

                        {book.isHydrated && book.status === 'NOT_TRACKED' && (
                            <div className="py-12 text-center space-y-3">
                                <div className="text-[10px] tracking-[0.3em] uppercase text-amber-300/70">
                                    Market data starting up
                                </div>
                                <div className="text-[11.5px] text-white/45 leading-relaxed">
                                    The mirror is being notified now. Refresh in a few seconds.
                                </div>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="mt-1 px-4 py-1.5 rounded-md border border-white/10 hover:border-white/25 text-[10px] tracking-[0.3em] uppercase text-white/65 hover:text-white cursor-pointer"
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {book.isHydrated &&
                            book.status !== 'NOT_TRACKED' &&
                            asks.length === 0 &&
                            bids.length === 0 && (
                                <div className="py-12 text-center text-[10px] tracking-[0.3em] uppercase text-white/30">
                                    No open orders
                                </div>
                            )}

                        {book.isHydrated && (asks.length > 0 || bids.length > 0) && (
                            <div ref={scroll_ref} className="h-105 overflow-y-auto">
                                <div className="pt-3.5 space-y-0.5">
                                    {asks.length === 0 ? (
                                        <div className="py-4 text-center text-[10px] tracking-[0.28em] uppercase text-white/25">
                                            No asks
                                        </div>
                                    ) : (
                                        asks
                                            .map((lvl, i) => {
                                                const cum = book.cumulativeAsks[i] ?? lvl.size;
                                                const w = (cum / max_total) * 100;
                                                return (
                                                    <div
                                                        key={`ask-${lvl.price}`}
                                                        className="relative grid grid-cols-3 gap-x-10 pr-5 py-1.5 text-[13px] tabular-nums hover:bg-white/1.5 rounded-sm transition-colors"
                                                    >
                                                        <div
                                                            className="absolute inset-y-0 right-0 bg-rose-500/20 rounded-l-sm pointer-events-none"
                                                            style={{ width: `${w}%` }}
                                                        />
                                                        <span className="relative text-right font-medium text-rose-300">
                                                            {format_cents(lvl.price)}
                                                        </span>
                                                        <span className="relative text-right text-white font-light">
                                                            {format_size(lvl.size)}
                                                        </span>
                                                        <span className="relative text-right text-white/40 font-light">
                                                            {format_total(lvl.price, lvl.size)}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                            .reverse()
                                    )}
                                </div>

                                <div
                                    ref={spread_ref}
                                    className="my-5 flex items-center justify-between px-1 py-2.5 border-y border-white/6"
                                >
                                    <span className="text-[9.5px] tracking-[0.32em] uppercase text-white/45 font-medium">
                                        Spread
                                    </span>
                                    <span className="text-[13px] tabular-nums text-white/85 font-medium">
                                        {book.spread !== null
                                            ? `${(book.spread * 100).toFixed(2)}¢`
                                            : '0.00¢'}
                                    </span>
                                </div>

                                <div className="space-y-0.5">
                                    {bids.length === 0 ? (
                                        <div className="grid grid-cols-3 gap-x-10 pr-5 py-1.5 text-[13px] tabular-nums">
                                            <span className="col-span-3 text-center text-[10px] tracking-[0.28em] uppercase text-white/25">
                                                No bids
                                            </span>
                                        </div>
                                    ) : (
                                        bids.map((lvl, i) => {
                                            const cum = book.cumulativeBids[i] ?? lvl.size;
                                            const w = (cum / max_total) * 100;
                                            return (
                                                <div
                                                    key={`bid-${lvl.price}`}
                                                    className="relative grid grid-cols-3 gap-x-10 pr-5 py-1.5 text-[13px] tabular-nums hover:bg-white/1.5 rounded-sm transition-colors"
                                                >
                                                    <div
                                                        className="absolute inset-y-0 right-0 bg-emerald-500/20 rounded-l-sm pointer-events-none"
                                                        style={{ width: `${w}%` }}
                                                    />
                                                    <span className="relative text-right font-medium text-emerald-300">
                                                        {format_cents(lvl.price)}
                                                    </span>
                                                    <span className="relative text-right text-white font-light">
                                                        {format_size(lvl.size)}
                                                    </span>
                                                    <span className="relative text-right text-white/40 font-light">
                                                        {format_total(lvl.price, lvl.size)}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

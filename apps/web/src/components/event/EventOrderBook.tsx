'use client';

import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Outcome } from '@solmarket/types';
import { useOrderBook } from '@/lib/socket/useOrderBook';
import ToolTipComponent from '@/components/utility/ToolTipComponent';
import { cn } from '@/lib/utils';
import { TbReload } from 'react-icons/tb';

type ViewMode = 'asks' | 'bids' | 'center';

const VIEW_MODES: ReadonlyArray<{
    key: ViewMode;
    label: string;
    leftColor: string;
    rightColor: string;
}> = [
    { key: 'bids', label: 'Show bids only', leftColor: '#00c278', rightColor: '#5d606f' },
    { key: 'asks', label: 'Show asks only', leftColor: '#5d606f', rightColor: '#fd4b4e' },
    { key: 'center', label: 'Center on spread', leftColor: '#00c278', rightColor: '#fd4b4e' },
];

function BookViewIcon({
    leftColor,
    rightColor,
}: {
    leftColor: string;
    rightColor: string;
}): JSX.Element {
    return (
        <svg
            className="h-5 w-5"
            viewBox="0 0 25 25"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {[3, 7, 11, 15, 19].map((y) => (
                <rect key={`l${y}`} x="3" y={y} width="8" height="2" fill={leftColor} />
            ))}
            {[3, 7, 11, 15, 19].map((y) => (
                <rect key={`r${y}`} x="13" y={y} width="8" height="2" fill={rightColor} />
            ))}
        </svg>
    );
}

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
    const book = useOrderBook(marketId, selectedOutcome);
    const scroll_ref = useRef<HTMLDivElement | null>(null);
    const spread_ref = useRef<HTMLDivElement | null>(null);

    const center_book = useCallback((behavior: ScrollBehavior = 'smooth') => {
        const container = scroll_ref.current;
        const spread = spread_ref.current;
        if (!container || !spread) return;
        const container_rect = container.getBoundingClientRect();
        const spread_rect = spread.getBoundingClientRect();
        const offset_within_container = spread_rect.top - container_rect.top + container.scrollTop;
        const target =
            offset_within_container - container.clientHeight / 2 + spread_rect.height / 2;
        container.scrollTo({ top: target, behavior });
    }, []);

    const has_centered_ref = useRef<Outcome | null>(null);
    const has_data = book.isHydrated && (book.asks.length > 0 || book.bids.length > 0);
    const [view_mode, set_view_mode] = useState<ViewMode>('center');

    useEffect(() => {
        if (!has_data) return;
        if (view_mode !== 'center') return;
        if (has_centered_ref.current === selectedOutcome) return;
        has_centered_ref.current = selectedOutcome;
        requestAnimationFrame(() => center_book('auto'));
    }, [has_data, selectedOutcome, center_book, view_mode]);

    const handle_view_change = useCallback(
        (next: ViewMode) => {
            set_view_mode(next);
            if (next === 'center') {
                has_centered_ref.current = null;
                requestAnimationFrame(() => requestAnimationFrame(() => center_book()));
            } else {
                scroll_ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },
        [center_book],
    );

    const bids = book.bids.slice(0, VISIBLE_LEVELS);
    const asks = book.asks.slice(0, VISIBLE_LEVELS);
    const max_bid_total = book.cumulativeBids[bids.length - 1] ?? 0;
    const max_ask_total = book.cumulativeAsks[asks.length - 1] ?? 0;
    const max_total = Math.max(max_bid_total, max_ask_total, 1);

    return (
        <section className="rounded-lg overflow-hidden bg-dark-base">
            <header
                className={cn("group flex items-center justify-between px-4 py-3 border-white/7 cursor-pointer select-none")}
            >
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-[14px] text-white/70 cursor-pointer"
                >
                    <TbReload className='size-4' />
                    <span className="font-medium">Book</span>
                </button>
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                        {VIEW_MODES.map((m) => (
                            <ToolTipComponent key={m.key} side="top" content={m.label}>
                                <button
                                    type="button"
                                    aria-label={m.label}
                                    aria-pressed={view_mode === m.key}
                                    onClick={() => handle_view_change(m.key)}
                                    className={cn(
                                        'p-1 rounded transition-colors cursor-pointer',
                                        view_mode === m.key
                                            ? 'bg-white/8'
                                            : 'opacity-60 hover:opacity-100 hover:bg-white/5',
                                    )}
                                >
                                    <BookViewIcon
                                        leftColor={m.leftColor}
                                        rightColor={m.rightColor}
                                    />
                                </button>
                            </ToolTipComponent>
                        ))}
                    </div>
                    <div className="flex gap-1 bg-white/2.5 border border-white/8 rounded-md p-0.75">
                        {[Outcome.YES, Outcome.NO].map((o) => (
                            <button
                                key={o}
                                type="button"
                                onClick={() => onOutcomeChange(o)}
                                className={cn(
                                    'px-2.5 py-1 rounded text-[9.5px] tracking-[0.24em] uppercase font-medium cursor-pointer transition-colors',
                                    selectedOutcome === o
                                        ? o === Outcome.YES ? 'bg-emerald-500/35 text-white' : 'bg-rose-500/35 text-white' : 'bg-transparent text-white/55 hover:text-white/80',
                                )}
                            >
                                {o}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div
                className={`overflow-hidden [overflow-anchor:none] transition-[max-height] duration-300 ease-in-out `}
            >
                <div>
                    <div className="pt-1">
                        <div className="grid grid-cols-3 pr-3 gap-x-8 text-[11.5px] text-white/35 pb-2 border-b border-white/7">
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
                            <div ref={scroll_ref} className="h-105 overflow-y-auto custom-scrollbar">
                                {view_mode !== 'bids' && (
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
                                                        className="relative grid grid-cols-3 gap-x-8 pr-3 py-1.5 text-[13px] tabular-nums hover:bg-white/1.5 rounded-sm transition-colors"
                                                    >
                                                        <div
                                                            className="absolute inset-y-0 right-0 bg-rose-500/35 rounded-none pointer-events-none"
                                                            style={{ width: `${w}%` }}
                                                        />
                                                        <span className="relative text-right font-medium text-rose-500">
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
                                )}

                                {view_mode === 'center' && (
                                <div
                                    ref={spread_ref}
                                    className="my-5 flex items-center justify-between px-3 py-2.5 border-y border-white/6"
                                >
                                    <span className="text-[9.5px] tracking-[0.22em] uppercase text-white/45 font-medium">
                                        Spread
                                    </span>
                                    <span className="text-[13px] tabular-nums text-white/85 font-medium">
                                        {book.spread !== null
                                            ? `${(book.spread * 100).toFixed(2)}¢`
                                            : '0.00¢'}
                                    </span>
                                </div>
                                )}

                                {view_mode !== 'asks' && (
                                <div className="space-y-0.5">
                                    {bids.length === 0 ? (
                                        <div className="grid grid-cols-3 gap-x-3 pr-3 py-1.5 text-[13px] tabular-nums">
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
                                                    className="relative grid grid-cols-3 gap-x-3 pr-3 py-1.5 text-[13px] tabular-nums hover:bg-white/1.5 rounded-sm transition-colors"
                                                >
                                                    <div
                                                        className="absolute inset-y-0 right-0 bg-emerald-500/35 rounded-none pointer-events-none"
                                                        style={{ width: `${w}%` }}
                                                    />
                                                    <span className="relative text-right font-medium text-emerald-500">
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
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

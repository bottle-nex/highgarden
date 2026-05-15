'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { cn } from '@/lib/utils';
import {
    asset_label_for_symbol,
    binance_symbol_for_series,
    fetch_binance_price,
    subscribe_binance_trades,
} from '@/lib/binance-price';

/**
 * Live spot-price headline for a fast-moving market — e.g. "BTC $81,643.45"
 * with a delta from when the user opened the page. Mounts above the
 * probability chart for FAST_MOVING markets only, so users have the
 * actual asset price visible while trading a 5-min Up/Down round.
 *
 * Renders nothing when the series's underlying asset isn't on Binance
 * spot (Hyperliquid, etc.), or when the chart's series key doesn't
 * parse.
 */
export default function LiveAssetPrice({
    seriesKey,
}: {
    seriesKey: string;
}): JSX.Element | null {
    const symbol = binance_symbol_for_series(seriesKey);
    const [price, set_price] = useState<number | null>(null);
    const [anchor, set_anchor] = useState<number | null>(null);
    const last_price_ref = useRef<number | null>(null);
    const [flash, set_flash] = useState<'up' | 'down' | null>(null);

    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        let teardown: (() => void) | null = null;

        // REST seeds the headline so it isn't "—" while the WSS handshake
        // is in flight. Once a tick arrives, the WSS becomes the source
        // of truth and REST is forgotten.
        void fetch_binance_price(symbol).then((p) => {
            if (cancelled || p === null) return;
            set_price((prev) => prev ?? p);
            set_anchor((prev) => prev ?? p);
        });

        teardown = subscribe_binance_trades(symbol, (next) => {
            if (cancelled) return;
            const prev = last_price_ref.current;
            last_price_ref.current = next;
            set_price(next);
            set_anchor((a) => a ?? next);
            if (prev !== null && prev !== next) {
                set_flash(next > prev ? 'up' : 'down');
                window.setTimeout(() => set_flash(null), 350);
            }
        });

        return () => {
            cancelled = true;
            teardown?.();
            last_price_ref.current = null;
        };
    }, [symbol]);

    if (!symbol) return null;

    const label = asset_label_for_symbol(symbol);
    const delta = price !== null && anchor !== null ? price - anchor : null;
    const delta_pct = delta !== null && anchor ? (delta / anchor) * 100 : null;
    const direction = delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : null;

    return (
        <div className="flex items-center gap-3 px-3 sm:px-5 py-2 border-b border-white/8">
            <span className="text-[10px] tracking-[0.25em] uppercase text-white/45">
                {label} · live
            </span>
            <span
                className={cn(
                    'text-[15px] sm:text-[16px] font-semibold tabular-nums transition-colors duration-300',
                    flash === 'up'
                        ? 'text-emerald-300'
                        : flash === 'down'
                          ? 'text-rose-300'
                          : 'text-white',
                )}
            >
                {price === null
                    ? '—'
                    : price.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })}
            </span>
            {delta !== null && delta_pct !== null && (
                <span
                    className={cn(
                        'text-[11px] tabular-nums',
                        direction === 'up'
                            ? 'text-emerald-400/85'
                            : direction === 'down'
                              ? 'text-rose-400/85'
                              : 'text-white/45',
                    )}
                >
                    {direction === 'up' ? '▲' : direction === 'down' ? '▼' : ''}
                    {delta >= 0 ? '+' : ''}
                    {delta.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}{' '}
                    ({delta_pct >= 0 ? '+' : ''}
                    {delta_pct.toFixed(3)}%)
                </span>
            )}
            <span className="ml-auto text-[10px] tracking-[0.2em] uppercase text-white/35">
                since opened
            </span>
        </div>
    );
}

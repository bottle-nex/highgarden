'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { cn } from '@/lib/utils';
import { fetch_round_anchor } from '@/lib/api/markets';
import {
    asset_label_for_rtds_target,
    polymarket_rtds_target_for_series,
    subscribe_polymarket_rtds,
    type RtdsTarget,
} from '@/lib/polymarket-rtds';
import { fetch_binance_price } from '@/lib/binance-price';

/**
 * Single-row header for fast-moving Up/Down crypto markets:
 *   • Left  — rounded pill, "Price to Beat" + USD value. Pulled once
 *     from `GET /markets/:id/round-anchor` (the persisted anchor the
 *     RTDS recorder captured at slot start).
 *   • Right — "<ASSET> · LIVE", current price, delta-from-anchor in
 *     green/red. Streamed live from Polymarket's RTDS (Chainlink topic
 *     where available, Binance for BNB).
 *
 * Replaces the standalone `LiveAssetPrice` headline so the user only
 * ever sees one current-price element on the page.
 *
 * Renders nothing for assets that aren't tracked on RTDS at all
 * (defensive — currently every asset we list IS tracked) or when the
 * recorder hasn't captured the slot's anchor yet (very fresh slot).
 */
function format_usd(value: number): string {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Maps an RTDS target to the Binance REST symbol used to seed the
 *  ticker before the WSS handshake completes. Chainlink targets use
 *  the spot equivalent (`btc/usd` → `BTCUSDT`); Binance targets pass
 *  through after upper-casing. Returns null when no Binance equivalent
 *  exists — caller renders "—" until RTDS delivers a tick. */
function binance_seed_symbol(target: RtdsTarget): string | null {
    if (target.topic === 'crypto_prices_chainlink') {
        const m = target.symbol.match(/^([a-z0-9]+)\//i);
        if (!m) return null;
        return `${m[1]!.toUpperCase()}USDT`;
    }
    return target.symbol.toUpperCase();
}

export default function RoundPriceCompare({
    marketId,
    seriesKey,
}: {
    marketId: string;
    seriesKey: string;
}): JSX.Element | null {
    const target = polymarket_rtds_target_for_series(seriesKey);
    const [anchor, set_anchor] = useState<number | null>(null);
    const [current, set_current] = useState<number | null>(null);
    const last_price_ref = useRef<number | null>(null);
    const [flash, set_flash] = useState<'up' | 'down' | null>(null);

    // Persisted anchor from our backend. The recorder writes one row per
    // minute boundary; if the slot just opened in the last few seconds
    // and the first RTDS tick hasn't landed yet, this returns null and
    // the whole panel hides until the recorder catches up. We don't
    // poll — the anchor is immutable once captured.
    useEffect(() => {
        if (!target) return;
        let cancelled = false;
        void fetch_round_anchor(marketId).then((row) => {
            if (cancelled || !row) return;
            set_anchor(row.price);
        });
        return () => {
            cancelled = true;
        };
    }, [marketId, target]);

    // Live price via Polymarket RTDS — same source Polymarket's own UI
    // reads. We also seed via Binance REST so the ticker shows a real
    // number within ~50ms of mount instead of waiting for the WSS
    // handshake (which can take 1-2s on a cold tab).
    useEffect(() => {
        if (!target) return;
        let cancelled = false;

        const seed_symbol = binance_seed_symbol(target);
        if (seed_symbol) {
            void fetch_binance_price(seed_symbol).then((p) => {
                if (cancelled || p === null) return;
                // Only seed if no real RTDS tick has landed yet — the
                // stream is authoritative the moment it starts pushing.
                set_current((prev) => prev ?? p);
            });
        }

        const teardown = subscribe_polymarket_rtds(target, (next) => {
            const prev = last_price_ref.current;
            last_price_ref.current = next;
            set_current(next);
            if (prev !== null && prev !== next) {
                set_flash(next > prev ? 'up' : 'down');
                window.setTimeout(() => set_flash(null), 350);
            }
        });
        return () => {
            cancelled = true;
            teardown();
            last_price_ref.current = null;
        };
    }, [target]);

    if (!target) return null;
    if (anchor === null) return null;

    const label = asset_label_for_rtds_target(target);
    const delta = current !== null ? current - anchor : null;
    const direction = delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : null;
    const delta_pct = delta !== null && anchor ? (delta / anchor) * 100 : null;

    return (
        <div className="flex items-center flex-wrap gap-3 px-3 sm:px-5 py-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-dark-base px-3.5 py-1.5">
                <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">
                    Price to Beat
                </span>
                <span className="text-[13px] sm:text-[14px] font-semibold tabular-nums text-white/90">
                    {format_usd(anchor)}
                </span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] tracking-[0.22em] uppercase text-white/45">
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
                    {current === null ? '—' : format_usd(current)}
                </span>
                {delta !== null && delta_pct !== null && direction !== null && (
                    <span
                        className={cn(
                            'text-[11px] tabular-nums',
                            direction === 'up' ? 'text-emerald-400/85' : 'text-rose-400/85',
                        )}
                    >
                        {direction === 'up' ? '▲' : '▼'}
                        {delta >= 0 ? '+' : ''}
                        {format_usd(delta)} ({delta_pct >= 0 ? '+' : ''}
                        {delta_pct.toFixed(3)}%)
                    </span>
                )}
            </div>
        </div>
    );
}

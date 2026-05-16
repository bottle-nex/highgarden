'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from 'recharts';
import type { PriceHistoryRange } from '@solmarket/types';
import {
    asset_label_for_symbol,
    binance_symbol_for_series,
    fetch_binance_klines,
    subscribe_binance_klines,
    type BinanceKlineInterval,
    type Kline,
} from '@/lib/binance-price';

/**
 * Underlying-asset chart for FAST_MOVING markets — renders Binance
 * spot data so the user can see the actual BTC / ETH / etc. price
 * (the metric that determines resolution) instead of just the YES/NO
 * probability line. Two render modes:
 *
 *   "price"   — area chart of close prices, dense and smooth so the
 *               short-term direction reads at a glance
 *   "candles" — OHLC candlesticks, useful when the user wants to see
 *               how aggressively each interval swung
 *
 * Data path: REST seed via /api/v3/klines for the historical window,
 * then live updates via the kline WSS so the rightmost candle keeps
 * mutating until it closes. The component owns its own subscription
 * lifecycle keyed on (symbol, interval); nothing leaks across remounts.
 */

type ChartMode = 'price' | 'candles';

interface Props {
    seriesKey: string;
    range: PriceHistoryRange;
    mode: ChartMode;
    showXAxis: boolean;
    showYAxis: boolean;
    showHorizontalGrid: boolean;
    showVerticalGrid: boolean;
}

/** Map our existing range buttons to the (interval, count) Binance
 *  klines we need so each range yields ~60-200 candles in the chart —
 *  dense enough to feel smooth without overshooting the 1000-row cap. */
function range_to_klines(range: PriceHistoryRange): {
    interval: BinanceKlineInterval;
    limit: number;
} {
    switch (range) {
        case '1h':
            return { interval: '1m', limit: 60 };
        case '6h':
            return { interval: '5m', limit: 72 };
        case '1d':
            return { interval: '15m', limit: 96 };
        case '1w':
            return { interval: '1h', limit: 168 };
        case '1m':
            return { interval: '4h', limit: 180 };
        case 'all':
            return { interval: '1d', limit: 365 };
    }
}

function format_x_label(t: number, range: PriceHistoryRange): string {
    const d = new Date(t);
    if (range === '1h' || range === '6h' || range === '1d') {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function format_usd(v: number): string {
    return v.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

interface PriceTooltipShape {
    active?: boolean;
    payload?: Array<{ payload: { t: number; c: number; o: number; h: number; l: number } }>;
    label?: string;
    range: PriceHistoryRange;
}

function PriceTooltip({ active, payload, range }: PriceTooltipShape): JSX.Element | null {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]!.payload;
    return (
        <div
            style={{
                background: 'rgba(6,6,8,0.94)',
                border: '1px solid rgba(245,158,11,0.22)',
                borderRadius: 6,
                padding: '8px 12px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(16px)',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(245,158,11,0.7)',
                    marginBottom: 4,
                }}
            >
                {format_x_label(p.t, range)}
            </div>
            <div
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.92)',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {format_usd(p.c)}
            </div>
            <div
                style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.45)',
                    marginTop: 3,
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                O {format_usd(p.o)} · H {format_usd(p.h)} · L {format_usd(p.l)}
            </div>
        </div>
    );
}

/** Thin dotted vertical cursor for the BarChart hover. Recharts' default
 *  BarChart cursor is a translucent rectangle the full width of the
 *  slot, which reads as a "thick line" over a dense candle row. We
 *  draw a one-pixel dashed line at the slot's center instead, matching
 *  the indicator Polymarket uses on their fast-moving charts. */
function DottedCursor(props: unknown): JSX.Element {
    const p = props as { x?: number; y?: number; width?: number; height?: number };
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    const width = p.width ?? 0;
    const height = p.height ?? 0;
    const cx = x + width / 2;
    return (
        <line
            x1={cx}
            x2={cx}
            y1={y}
            y2={y + height}
            stroke="rgba(245,158,11,0.6)"
            strokeWidth={1}
            strokeDasharray="3 4"
            pointerEvents="none"
        />
    );
}

/** Custom shape that draws a candlestick body + wick inside a recharts
 *  Bar. Recharts gives us the band's (x, width) and a height calculated
 *  from `[low, high]`; we reach into the row to position the OHLC body
 *  inside that band manually. Sized so very thin price moves still show
 *  a visible body (minimum 1px). */
function Candle(props: unknown): JSX.Element {
    const p = props as {
        x: number;
        y: number;
        width: number;
        height: number;
        payload: { o: number; c: number; h: number; l: number };
    };
    const { x, width, payload, y, height } = p;
    const { o, c, h, l } = payload;
    const range = h - l || 1;
    const top_y = y;
    const bottom_y = y + height;
    const body_top_v = Math.max(o, c);
    const body_bottom_v = Math.min(o, c);
    const body_top_y = top_y + ((h - body_top_v) / range) * height;
    const body_bottom_y = top_y + ((h - body_bottom_v) / range) * height;
    const body_h = Math.max(1, body_bottom_y - body_top_y);
    const center_x = x + width / 2;
    const is_up = c >= o;
    const color = is_up ? '#10b981' : '#ef4444';
    const body_w = Math.max(2, width * 0.7);
    const body_x = center_x - body_w / 2;
    return (
        <g>
            <line
                x1={center_x}
                x2={center_x}
                y1={top_y}
                y2={bottom_y}
                stroke={color}
                strokeWidth={1}
            />
            <rect x={body_x} y={body_top_y} width={body_w} height={body_h} fill={color} />
        </g>
    );
}

export default function EventBtcPriceChart({
    seriesKey,
    range,
    mode,
    showXAxis,
    showYAxis,
    showHorizontalGrid,
    showVerticalGrid,
}: Props): JSX.Element | null {
    const symbol = binance_symbol_for_series(seriesKey);
    const [klines, set_klines] = useState<Kline[]>([]);
    const [status, set_status] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        if (!symbol) return;
        const { interval, limit } = range_to_klines(range);
        let cancelled = false;
        let teardown: (() => void) | null = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        set_status('loading');
         
        set_klines([]);

        void fetch_binance_klines(symbol, interval, limit).then((rows) => {
            if (cancelled) return;
            if (rows.length === 0) {
                set_status('error');
                return;
            }
            set_klines(rows);
            set_status('ready');
        });

        // Live updates: every kline tick either updates the trailing
        // candle (in-progress) or appends a new one (just-closed).
        teardown = subscribe_binance_klines(symbol, interval, (k) => {
            if (cancelled) return;
            set_klines((prev) => {
                if (prev.length === 0) return [k];
                const last = prev[prev.length - 1]!;
                if (k.t === last.t) {
                    const next = prev.slice(0, -1);
                    next.push(k);
                    return next;
                }
                if (k.t > last.t) {
                    const next = prev.length >= limit ? prev.slice(1) : prev.slice();
                    next.push(k);
                    return next;
                }
                // older-than-tail tick — ignore (would corrupt ordering)
                return prev;
            });
        });

        return () => {
            cancelled = true;
            teardown?.();
        };
    }, [symbol, range]);

    const xTicks = useMemo(() => {
        if (klines.length === 0) return [];
        const stepMs: Record<PriceHistoryRange, number> = {
            '1h': 15 * 60_000,
            '6h': 60 * 60_000,
            '1d': 4 * 60 * 60_000,
            '1w': 24 * 60 * 60_000,
            '1m': 7 * 24 * 60 * 60_000,
            all: 30 * 24 * 60 * 60_000,
        };
        const step = stepMs[range];
        const out: number[] = [];
        let last = -Infinity;
        for (const k of klines) {
            if (k.t - last >= step) {
                out.push(k.t);
                last = k.t;
            }
        }
        return out;
    }, [klines, range]);

    const { yMin, yMax } = useMemo(() => {
        if (klines.length === 0) return { yMin: 0, yMax: 1 };
        let lo = Infinity;
        let hi = -Infinity;
        for (const k of klines) {
            if (k.l < lo) lo = k.l;
            if (k.h > hi) hi = k.h;
        }
        const span = Math.max(1, hi - lo);
        return { yMin: lo - span * 0.05, yMax: hi + span * 0.05 };
    }, [klines]);

    if (!symbol) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                {asset_label_for_symbol(seriesKey)} not available on Binance spot
            </div>
        );
    }

    if (status === 'loading' && klines.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                Loading {asset_label_for_symbol(symbol)} price…
            </div>
        );
    }

    if (status === 'error' && klines.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-rose-300/60">
                Couldn&apos;t load {asset_label_for_symbol(symbol)} price
            </div>
        );
    }

    const data = klines;

    if (mode === 'candles') {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid
                        stroke="rgba(255,255,255,0.03)"
                        strokeDasharray="4 3"
                        horizontal={showHorizontalGrid}
                        vertical={showVerticalGrid}
                    />
                    <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        ticks={xTicks}
                        tickFormatter={(v) => format_x_label(v as number, range)}
                        hide={!showXAxis}
                        tick={{ fill: '#a3a3a3', fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        domain={[yMin, yMax]}
                        hide={!showYAxis}
                        tick={{ fill: '#a3a3a3', fontSize: 10 }}
                        tickFormatter={(v) =>
                            `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                        }
                        tickLine={false}
                        axisLine={false}
                        width={showYAxis ? 56 : 0}
                        tickCount={5}
                    />
                    <Tooltip
                        content={(p: TooltipContentProps) => (
                            <PriceTooltip
                                active={p.active}
                                payload={
                                    p.payload as unknown as PriceTooltipShape['payload']
                                }
                                range={range}
                            />
                        )}
                        // BarChart's default cursor is a thick filled
                        // rectangle the width of the slot — visually
                        // distracting on a dense candle row. Replace
                        // with a 1px dashed vertical line at the slot's
                        // center, matching the indicator Polymarket
                        // shows on their fast-moving charts.
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        cursor={DottedCursor as any}
                        isAnimationActive={false}
                    />
                    <Bar
                        dataKey={(d: Kline) => [d.l, d.h] as [number, number]}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        shape={Candle as any}
                        isAnimationActive={false}
                    />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    // mode === 'price'
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
                <defs>
                    <linearGradient id="evtBtcPriceArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(245,158,11,0.35)" />
                        <stop offset="100%" stopColor="rgba(245,158,11,0.02)" />
                    </linearGradient>
                </defs>
                <CartesianGrid
                    stroke="rgba(255,255,255,0.03)"
                    strokeDasharray="4 3"
                    horizontal={showHorizontalGrid}
                    vertical={showVerticalGrid}
                />
                <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    ticks={xTicks}
                    tickFormatter={(v) => format_x_label(v as number, range)}
                    hide={!showXAxis}
                    tick={{ fill: '#a3a3a3', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    domain={[yMin, yMax]}
                    hide={!showYAxis}
                    tick={{ fill: '#a3a3a3', fontSize: 10 }}
                    tickFormatter={(v) =>
                        `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    }
                    tickLine={false}
                    axisLine={false}
                    width={showYAxis ? 56 : 0}
                    tickCount={5}
                />
                <Tooltip
                    content={(p: TooltipContentProps) => (
                        <PriceTooltip
                            active={p.active}
                            payload={p.payload as unknown as PriceTooltipShape['payload']}
                            range={range}
                        />
                    )}
                    cursor={{ stroke: 'rgba(245,158,11,0.25)' }}
                    isAnimationActive={false}
                />
                <Area
                    type="monotone"
                    dataKey="c"
                    stroke="rgba(245,158,11,0.95)"
                    strokeWidth={2}
                    fill="url(#evtBtcPriceArea)"
                    isAnimationActive={false}
                    activeDot={{ r: 3, fill: '#f59e0b' }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

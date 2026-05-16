'use client';

import {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useState,
    type JSX,
} from 'react';
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
        <div className="rounded-md bg-dark-alpha ring-1 ring-white/5 backdrop-blur-xl px-3 py-2 pointer-events-none">
            <div className="text-[9px] tracking-[0.18em] uppercase text-white/40 mb-1">
                {format_x_label(p.t, range)}
            </div>
            <div className="text-[13px] font-semibold text-white/95 tabular-nums">
                {format_usd(p.c)}
            </div>
            <div className="text-[10px] text-white/40 mt-0.5 tabular-nums">
                O {format_usd(p.o)} · H {format_usd(p.h)} · L {format_usd(p.l)}
            </div>
        </div>
    );
}

/** Thin dotted vertical cursor for the BarChart hover. Recharts' default
 *  BarChart cursor is a translucent rectangle the full width of the
 *  slot, which reads as a "thick line" over a dense candle row. We
 *  draw a one-pixel dashed line at the slot's center instead, matching
 *  the indicator Polymarket uses on their fast-moving charts.
 *
 *  Memo'd so recharts' internal re-renders on every mouse move don't
 *  trigger a fresh React reconciliation of the cursor's SVG when the
 *  cursor position hasn't actually changed.
 */
interface DottedCursorProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}
const DottedCursor = memo(function DottedCursor(props: DottedCursorProps): JSX.Element {
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const width = props.width ?? 0;
    const height = props.height ?? 0;
    // Round then offset by 0.5 so a 1px stroke lands inside a single
    // device-pixel column instead of straddling two. Standard SVG
    // hairline trick. Combined with crispEdges this stops the line
    // from anti-aliasing into a ~2px smear.
    const cx = Math.round(x + width / 2) + 0.5;
    return (
        <line
            x1={cx}
            x2={cx}
            y1={y}
            y2={y + height}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1}
            strokeDasharray="1 5"
            shapeRendering="crispEdges"
            pointerEvents="none"
        />
    );
});

/** Custom shape that draws a candlestick body + wick inside a recharts
 *  Bar. Recharts gives us the band's (x, width) and a height calculated
 *  from `[low, high]`; we reach into the row to position the OHLC body
 *  inside that band manually. Sized so very thin price moves still show
 *  a visible body (minimum 1px).
 *
 *  Memo'd so when recharts re-renders the BarChart on hover, candles
 *  whose (x, y, width, height, payload) haven't changed bail out of
 *  reconciliation. With 60-365 bars this is the single biggest win
 *  for hover smoothness.
 */
interface CandleProps {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: { o: number; c: number; h: number; l: number };
}
const Candle = memo(function Candle(props: CandleProps): JSX.Element {
    const { x, width, payload, y, height } = props;
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
});

// Hoisted to module scope so React reconciliation sees stable references
// instead of fresh object/function refs every parent render. The dataKey
// is what feeds recharts the [low, high] band each candle spans.
const CHART_MARGIN = { top: 24, right: 16, bottom: 0, left: 0 } as const;
const TICK_STYLE = { fill: '#a3a3a3', fontSize: 10 } as const;
const KLINE_DATA_KEY = (d: Kline): [number, number] => [d.l, d.h];
const PRICE_AREA_ACTIVE_DOT = { r: 3, fill: '#f59e0b' } as const;
const PRICE_AREA_CURSOR = { stroke: 'rgba(245,158,11,0.25)' } as const;

// Function-form `shape` lets recharts pass per-bar props (x, y, width,
// height, payload) which we forward to the memo'd component. React
// reconciles the returned element per bar; identical props short-circuit
// the render.
function render_candle_shape(props: unknown): JSX.Element {
    return <Candle {...(props as CandleProps)} />;
}

function EventBtcPriceChart({
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
    // Vertical (recharts cursor) tracks the active slot. Horizontal line
    // needs the raw mouse y, which we capture from BarChart's onMouseMove
    // and render via a div overlay sibling to ResponsiveContainer.
    const [cursor_y, set_cursor_y] = useState<number | null>(null);

    const handle_chart_mouse_move = useCallback(
        (state: { activeCoordinate?: { y?: number } }) => {
            const y = state?.activeCoordinate?.y;
            if (typeof y === 'number') set_cursor_y(y);
        },
        [],
    );
    const handle_chart_mouse_leave = useCallback((): void => {
        set_cursor_y(null);
    }, []);

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

        // Throttle live kline commits to ~5Hz. Binance pushes the same
        // candle's OHLC many times per second during volatility; recharts
        // re-rendering 60-365 bars per push is what causes the lag the
        // user sees. We buffer by `t` (so the rare close-frame + new-
        // candle-open within one window are both preserved) and flush
        // either on the leading edge of an idle window or via a single
        // trailing setTimeout.
        const DISPLAY_THROTTLE_MS = 200;
        const pending = new Map<number, Kline>();
        let last_commit_at = 0;
        let trailing_timer: ReturnType<typeof setTimeout> | null = null;

        const apply_batch = (): void => {
            if (pending.size === 0) return;
            const batch = Array.from(pending.values()).sort((a, b) => a.t - b.t);
            pending.clear();
            last_commit_at = performance.now();
            set_klines((prev) => {
                let next = prev;
                for (const k of batch) {
                    if (next.length === 0) {
                        next = [k];
                        continue;
                    }
                    const last = next[next.length - 1]!;
                    if (k.t === last.t) {
                        next = next.slice(0, -1);
                        next.push(k);
                    } else if (k.t > last.t) {
                        next = next.length >= limit ? next.slice(1) : next.slice();
                        next.push(k);
                    }
                    // older-than-tail tick: ignore (would corrupt ordering)
                }
                return next;
            });
        };

        teardown = subscribe_binance_klines(symbol, interval, (k) => {
            if (cancelled) return;
            pending.set(k.t, k);
            const now = performance.now();
            const since = now - last_commit_at;
            if (since >= DISPLAY_THROTTLE_MS) {
                apply_batch();
                return;
            }
            if (trailing_timer !== null) return;
            trailing_timer = setTimeout(() => {
                trailing_timer = null;
                apply_batch();
            }, DISPLAY_THROTTLE_MS - since);
        });

        return () => {
            cancelled = true;
            if (trailing_timer !== null) {
                clearTimeout(trailing_timer);
                trailing_timer = null;
            }
            pending.clear();
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

    // Defer the chart data so React can prioritise input (hover, scroll)
    // over re-rendering the bar/area set. When a throttled kline commit
    // lands while the user is dragging across the chart, React renders
    // the cursor at the new pointer position first and applies the new
    // data on the next idle tick, keeping mouse-move responsive.
    const data = useDeferredValue(klines);

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

    if (mode === 'candles') {
        return (
            <div className="relative w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={data}
                        margin={CHART_MARGIN}
                        onMouseMove={handle_chart_mouse_move}
                        onMouseLeave={handle_chart_mouse_leave}
                    >
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
                        tick={TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        domain={[yMin, yMax]}
                        hide={!showYAxis}
                        tick={TICK_STYLE}
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
                        // rectangle the width of the slot, visually
                        // distracting on a dense candle row. Replace
                        // with a 1px dashed vertical line at the slot's
                        // center, matching the indicator Polymarket
                        // shows on their fast-moving charts.
                        cursor={<DottedCursor />}
                        isAnimationActive={false}
                    />
                    <Bar
                        dataKey={KLINE_DATA_KEY}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        shape={render_candle_shape as any}
                        isAnimationActive={false}
                    />
                    </BarChart>
                </ResponsiveContainer>
                {cursor_y !== null && (
                    <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                            top: cursor_y - 0.5,
                            height: 1,
                            backgroundImage:
                                'repeating-linear-gradient(to right, rgba(255,255,255,0.28) 0 1px, transparent 1px 6px)',
                        }}
                    />
                )}
            </div>
        );
    }

    // mode === 'price'
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={CHART_MARGIN}>
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
                    cursor={PRICE_AREA_CURSOR}
                    isAnimationActive={false}
                />
                <Area
                    type="monotone"
                    dataKey="c"
                    stroke="rgba(245,158,11,0.95)"
                    strokeWidth={2}
                    fill="url(#evtBtcPriceArea)"
                    isAnimationActive={false}
                    activeDot={PRICE_AREA_ACTIVE_DOT}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// Memo: all props are primitives, so shallow equality bails out cleanly
// when the parent re-renders without the chart's inputs actually changing
// (the NowClock 1Hz tick, settings popover toggles, outcome switch, etc.).
export default memo(EventBtcPriceChart);

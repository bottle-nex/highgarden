'use client';

import { JSX, useEffect, useMemo, useRef, useState } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    type TooltipContentProps,
} from 'recharts';
import { Outcome, type PriceHistoryPoint, type PriceHistoryRange } from '@solmarket/types';
import { fetch_market_price_history } from '@/lib/api/markets';
import { TbSettings } from "react-icons/tb";

const RANGES: ReadonlyArray<{ key: PriceHistoryRange; label: string }> = [
    { key: '1h', label: '1H' },
    { key: '6h', label: '6H' },
    { key: '1d', label: '1D' },
    { key: '1w', label: '1W' },
    { key: '1m', label: '1M' },
    { key: 'all', label: 'ALL' },
];

interface ChartPoint {
    t: number;
    pct: number;
    label: string;
}

interface Props {
    marketId: string;
    volumeLabel: string;
    closeLabel: string;
    onLoaded?: (latestPct: number, delta24hPct: number | null) => void;
}

function format_x_label(t: number, range: PriceHistoryRange): string {
    const d = new Date(t * 1000);
    if (range === '1h' || range === '6h' || range === '1d') {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0].payload as ChartPoint;
    return (
        <div
            style={{
                background: 'rgba(6,6,8,0.94)',
                border: '1px solid rgba(255,214,8,0.18)',
                borderRadius: 6,
                padding: '8px 14px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(16px)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    fontFamily: 'var(--m-, monospace)',
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,214,8,0.55)',
                    marginBottom: 2,
                }}
            >
                {point.label}
            </div>
            <div
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.92)',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {point.pct.toFixed(1)}%
            </div>
        </div>
    );
}

export default function EventPriceChart({
    marketId,
    volumeLabel,
    closeLabel,
    onLoaded,
}: Props): JSX.Element {
    const [range, set_range] = useState<PriceHistoryRange>('1d');
    const [activeCoord, set_active_coord] = useState<{ x: number; y: number } | null>(null);
    const [chart_svg_width, set_chart_svg_width] = useState(0);
    const wrapper_ref = useRef<HTMLDivElement>(null);
    const [snapshot, set_snapshot] = useState<{
        key: string;
        status: 'ready' | 'error';
        history: PriceHistoryPoint[];
    } | null>(null);
    const [selectedOutcome, setSelectedOutcome] = useState<Outcome>(Outcome.YES);
    const [settings_open, set_settings_open] = useState(false);
    const [showXAxis, setShowXAxis] = useState(false);
    const [showYAxis, setShowYAxis] = useState(true);
    const [showHorizontalGrid, setShowHorizontalGrid] = useState(true);
    const [showVerticalGrid, setShowVerticalGrid] = useState(false);
    const settings_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = wrapper_ref.current;
        if (!el) return;
        const update = (): void => {
            // px-2 → 8px padding each side; clientWidth includes padding
            set_chart_svg_width(Math.max(0, el.clientWidth - 16));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const current_key = `${marketId}:${range}`;
    const is_current = snapshot !== null && snapshot.key === current_key;
    const status: 'loading' | 'ready' | 'error' = is_current ? snapshot.status : 'loading';

    useEffect(() => {
        let cancelled = false;
        fetch_market_price_history(marketId, range)
            .then((dto) => {
                if (cancelled) return;
                if (!dto) {
                    set_snapshot({ key: `${marketId}:${range}`, status: 'error', history: [] });
                    return;
                }
                set_snapshot({
                    key: `${marketId}:${range}`,
                    status: 'ready',
                    history: dto.history,
                });
            })
            .catch(() => {
                if (cancelled) return;
                set_snapshot({ key: `${marketId}:${range}`, status: 'error', history: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [marketId, range]);

    const points = useMemo<ChartPoint[]>(() => {
        if (!is_current || !snapshot) return [];
        return snapshot.history.map((p) => ({
            t: p.t,
            pct: selectedOutcome === Outcome.NO ? 100 - p.p * 100 : p.p * 100,
            label: format_x_label(p.t, range),
        }));
    }, [is_current, snapshot, range, selectedOutcome]);

    const xTicks = useMemo(() => {
        if (points.length === 0) return [];
        const stepSeconds: Record<PriceHistoryRange, number> = {
            '1h': 15 * 60,
            '6h': 1 * 60 * 60,
            '1d': 4 * 60 * 60,
            '1w': 24 * 60 * 60,
            '1m': 7 * 24 * 60 * 60,
            'all': 30 * 24 * 60 * 60,
        };
        const step = stepSeconds[range];
        const result: number[] = [];
        let last = -Infinity;
        for (const p of points) {
            if (p.t - last >= step) {
                result.push(p.t);
                last = p.t;
            }
        }
        return result;
    }, [points, range]);

    const { yMin, yMax } = useMemo(() => {
        if (points.length === 0) return { yMin: 0, yMax: 100 };
        const min_v = Math.min(...points.map((p) => p.pct));
        const max_v = Math.max(...points.map((p) => p.pct));
        const r = Math.max(1, max_v - min_v);
        return { yMin: Math.max(0, min_v - r * 0.1), yMax: Math.min(100, max_v + r * 0.1) };
    }, [points]);

    useEffect(() => {
        if (status !== 'ready' || points.length === 0) return;
        const latest = points[points.length - 1]!.pct;
        let delta: number | null = null;
        if (range === '1d' && points.length >= 2) {
            delta = latest - points[0]!.pct;
        }
        onLoaded?.(latest, delta);
    }, [status, points, range, onLoaded]);

    useEffect(() => {
        if (!settings_open) return;
        const handler = (e: MouseEvent) => {
            if (settings_ref.current && !settings_ref.current.contains(e.target as Node)) {
                set_settings_open(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [settings_open]);

    function onOutcomeChange(o: Outcome) {
        setSelectedOutcome(o);
    }

    const isNo = selectedOutcome === Outcome.NO;
    const lineColor = isNo ? 'rgba(244,63,94,' : 'rgba(255,214,8,';
    const areaColor = lineColor;

    return (
        <section className="">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/55">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/80" />
                    PRICE HISTORY
                </div>
                <div className='flex items-center gap-x-3'>
                    <div className="flex gap-1 bg-white/2.5 border border-white/8 rounded-md p-0.75">
                        {[Outcome.YES, Outcome.NO].map((o) => (
                            <button
                                key={o}
                                type="button"
                                onClick={() => onOutcomeChange(o)}
                                className={`px-3 py-1 rounded text-[9px] tracking-[0.28em] uppercase font-medium transition-colors cursor-pointer ${selectedOutcome === o
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
                    <div className="flex gap-1 bg-white/[0.02] border border-white/10 rounded-md p-[3px]">
                        {RANGES.map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => set_range(r.key)}
                                className={`px-3 py-1 rounded text-[9px] tracking-[0.2em] uppercase  transition-colors cursor-pointer ${range === r.key
                                    ? 'bg-white/[0.07] text-white'
                                    : 'text-white/45 hover:text-white/75'
                                    }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <div ref={settings_ref} className="relative flex gap-1 bg-white/2 border border-white/10 rounded-md p-0.75">
                        <button
                            aria-label='settings'
                            type="button"
                            onClick={() => set_settings_open((v) => !v)}
                            className={`px-2 py-1 rounded transition-colors cursor-pointer flex items-center ${settings_open ? 'text-white/90 bg-white/[0.07]' : 'text-white/45 hover:text-white/75'}`}
                        >
                            <TbSettings className="w-3.5 h-3.5" />
                        </button>
                        {settings_open && (
                            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-lg border border-white/10 bg-[rgba(10,10,14,0.97)] shadow-[0_8px_32px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                                <div className="px-4 py-3 border-b border-white/8">
                                    <span className="text-[10px] tracking-[0.25em] uppercase text-white/55 font-medium">Settings</span>
                                </div>
                                <div className="px-4 py-2 flex flex-col gap-0.5">
                                    {([
                                        ['X-Axis', showXAxis, setShowXAxis],
                                        ['Y-Axis', showYAxis, setShowYAxis],
                                        ['Horizontal Grid', showHorizontalGrid, setShowHorizontalGrid],
                                        ['Vertical Grid', showVerticalGrid, setShowVerticalGrid],
                                    ] as [string, boolean, (v: boolean) => void][]).map(([label, value, setter]) => (
                                        <div key={label} className="flex items-center justify-between py-2">
                                            <span className="text-[11px] text-white/70">{label}</span>
                                            <button
                                                aria-label='settings'
                                                type="button"
                                                onClick={() => setter(!value)}
                                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${value ? 'bg-blue-500' : 'bg-white/15'}`}
                                            >
                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                ref={wrapper_ref}
                className="relative w-full px-2 select-none outline-none"
                style={{ aspectRatio: '600 / 260' }}
            >
                {status === 'loading' && points.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                        Loading…
                    </div>
                )}
                {status === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-rose-300/60">
                        Couldn&apos;t load price history
                    </div>
                )}
                {status === 'ready' && points.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.25em] uppercase text-white/30">
                        No price data for this range
                    </div>
                )}
                {points.length > 0 && (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={points}
                            margin={{ top: 24, right: 16, bottom: 0, left: 0 }}
                            onMouseMove={(state) => {
                                if (state.activeCoordinate) {
                                    set_active_coord({
                                        x: state.activeCoordinate.x,
                                        y: state.activeCoordinate.y,
                                    });
                                }
                            }}
                            onMouseLeave={() => set_active_coord(null)}
                        >
                            <defs>
                                <linearGradient
                                    id="evtPriceLine"
                                    x1="0"
                                    y1="0"
                                    x2={chart_svg_width || 1}
                                    y2="0"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    {activeCoord && chart_svg_width > 0 ? (
                                        <>
                                            <stop offset="0" stopColor={`${lineColor}0.9)`} />
                                            <stop
                                                offset={Math.max(
                                                    0,
                                                    activeCoord.x / chart_svg_width - 0.004,
                                                )}
                                                stopColor={`${lineColor}0.9)`}
                                            />
                                            <stop
                                                offset={Math.min(
                                                    1,
                                                    activeCoord.x / chart_svg_width + 0.004,
                                                )}
                                                stopColor={`${lineColor}0.1)`}
                                            />
                                            <stop offset="1" stopColor={`${lineColor}0.1)`} />
                                        </>
                                    ) : (
                                        <>
                                            <stop offset="0" stopColor={`${lineColor}0.5)`} />
                                            <stop offset="0.5" stopColor={`${lineColor}0.9)`} />
                                            <stop offset="1" stopColor={`${lineColor}0.7)`} />
                                        </>
                                    )}
                                </linearGradient>
                                <linearGradient
                                    id="evtPriceArea"
                                    x1="0"
                                    y1="0"
                                    x2={chart_svg_width || 1}
                                    y2="0"
                                    gradientUnits="userSpaceOnUse"
                                >
                                    {activeCoord && chart_svg_width > 0 ? (
                                        <>
                                            <stop offset="0" stopColor={`${areaColor}0.18)`} />
                                            <stop
                                                offset={Math.max(
                                                    0,
                                                    activeCoord.x / chart_svg_width - 0.004,
                                                )}
                                                stopColor={`${areaColor}0.18)`}
                                            />
                                            <stop
                                                offset={Math.min(
                                                    1,
                                                    activeCoord.x / chart_svg_width + 0.004,
                                                )}
                                                stopColor={`${areaColor}0.02)`}
                                            />
                                            <stop offset="1" stopColor={`${areaColor}0.02)`} />
                                        </>
                                    ) : (
                                        <>
                                            <stop offset="0" stopColor={`${areaColor}0.18)`} />
                                            <stop offset="1" stopColor={`${areaColor}0.18)`} />
                                        </>
                                    )}
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
                                tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 9, fontFamily: 'var(--m-, monospace)' }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                domain={[yMin, yMax]}
                                hide={!showYAxis}
                                tick={{
                                    fill: 'rgba(255,255,255,0.18)',
                                    fontSize: 9,
                                    fontFamily: 'var(--m-, monospace)',
                                }}
                                tickFormatter={(v) => `${Math.round(v)}%`}
                                tickLine={false}
                                axisLine={false}
                                width={showYAxis ? 40 : 0}
                                tickCount={5}
                            />
                            <Tooltip
                                content={(props) => <ChartTooltip {...props} />}
                                cursor={{ stroke: isNo ? 'rgba(244,63,94,0.25)' : 'rgba(255,214,8,0.3)', strokeWidth: 1 }}
                                isAnimationActive={false}
                                wrapperStyle={{ transition: 'none', pointerEvents: 'none' }}
                                position={
                                    activeCoord
                                        ? { x: activeCoord.x + 14, y: activeCoord.y - 22 }
                                        : undefined
                                }
                            />
                            <Area
                                type="monotone"
                                dataKey="pct"
                                stroke="url(#evtPriceLine)"
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="url(#evtPriceArea)"
                                activeDot={{
                                    r: 4.5,
                                    fill: isNo ? '#f43f5e' : '#ffd608',
                                    stroke: '#0E0D0D',
                                    strokeWidth: 2,
                                }}
                                animationDuration={600}
                                animationEasing="ease-out"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-white/8  text-[10px] tracking-[0.22em] uppercase text-white/40">
                <span>VOL {volumeLabel}</span>
                <span>{closeLabel}</span>
            </div>
        </section>
    );
}

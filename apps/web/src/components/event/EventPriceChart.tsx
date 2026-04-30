'use client';

import { JSX, useEffect, useMemo, useState } from 'react';
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
import type { PriceHistoryPoint, PriceHistoryRange } from '@solmarket/types';
import { fetch_market_price_history } from '@/lib/api/markets';

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
                border: '1px solid rgba(255,204,0,0.15)',
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
                    fontFamily: 'var(--m-font-mono, monospace)',
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,204,0,0.5)',
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
    const [snapshot, set_snapshot] = useState<{
        key: string;
        status: 'ready' | 'error';
        history: PriceHistoryPoint[];
    } | null>(null);

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
            pct: p.p * 100,
            label: format_x_label(p.t, range),
        }));
    }, [is_current, snapshot, range]);

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

    return (
        <section className="border border-white/10 rounded-[6px] bg-neutral-950/60">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-white/55">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/70" />
                    PRICE HISTORY
                </div>
                <div className="flex gap-1 bg-white/[0.02] border border-white/10 rounded-md p-[3px]">
                    {RANGES.map((r) => (
                        <button
                            key={r.key}
                            type="button"
                            onClick={() => set_range(r.key)}
                            className={`px-3 py-1 rounded text-[9px] tracking-[0.2em] uppercase font-mono transition-colors cursor-pointer ${
                                range === r.key
                                    ? 'bg-white/[0.07] text-white'
                                    : 'text-white/45 hover:text-white/75'
                            }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative w-full px-2" style={{ aspectRatio: '600 / 260' }}>
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
                                    set_active_coord({ x: state.activeCoordinate.x, y: state.activeCoordinate.y });
                                }
                            }}
                            onMouseLeave={() => set_active_coord(null)}
                        >
                            <defs>
                                <linearGradient id="evtPriceLine" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="rgba(255,204,0,0.5)" />
                                    <stop offset="50%" stopColor="rgba(255,204,0,0.9)" />
                                    <stop offset="100%" stopColor="rgba(255,204,0,0.7)" />
                                </linearGradient>
                                <linearGradient id="evtPriceArea" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(255,204,0,0.18)" />
                                    <stop offset="100%" stopColor="rgba(255,204,0,0)" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                stroke="rgba(255,255,255,0.03)"
                                strokeDasharray="4 3"
                                vertical={false}
                            />
                            <XAxis dataKey="t" hide />
                            <YAxis
                                domain={[yMin, yMax]}
                                tick={{
                                    fill: 'rgba(255,255,255,0.18)',
                                    fontSize: 9,
                                    fontFamily: 'var(--m-font-mono, monospace)',
                                }}
                                tickFormatter={(v) => `${Math.round(v)}%`}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                                tickCount={5}
                            />
                            <Tooltip
                                content={(props) => <ChartTooltip {...props} />}
                                cursor={{ stroke: 'rgba(255,204,0,0.25)', strokeWidth: 1 }}
                                isAnimationActive={false}
                                wrapperStyle={{ transition: 'none', pointerEvents: 'none' }}
                                position={activeCoord ? { x: activeCoord.x + 14, y: activeCoord.y - 22 } : undefined}
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
                                    fill: '#FFCC00',
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

            <div className="flex items-center justify-between px-5 py-4 border-t border-white/8 font-mono text-[10px] tracking-[0.22em] uppercase text-white/40">
                <span>VOL {volumeLabel}</span>
                <span>{closeLabel}</span>
            </div>
        </section>
    );
}

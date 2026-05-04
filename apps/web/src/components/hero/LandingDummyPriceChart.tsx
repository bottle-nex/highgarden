'use client';

import { JSX, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    YAxis,
} from 'recharts';
import { Outcome } from '@solmarket/types';
import { TbSettings } from 'react-icons/tb';
import ProbabilityHeadline from '@/components/event/ProbabilityHeadline';
import { LANDING_DEMO_MARKET_ID } from './useLandingDummyMarketFeed';

const RANGES = [
    { key: '1h', label: '1H' },
    { key: '6h', label: '6H' },
    { key: '1d', label: '1D' },
    { key: '1w', label: '1W' },
    { key: '1m', label: '1M' },
    { key: 'all', label: 'ALL' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

interface ChartPoint {
    t: number;
    pct: number;
}

const NUM_POINTS = 80;
const STEP_MS = 60 * 60 * 1000; // synthetic 1h cadence

function build_history(start_pct: number, end_pct: number): ChartPoint[] {
    const points: ChartPoint[] = [];
    const now = Date.now();
    const total_drift = end_pct - start_pct;
    let v = start_pct;
    for (let i = 0; i < NUM_POINTS; i++) {
        const progress = i / (NUM_POINTS - 1);
        const target = start_pct + total_drift * progress;
        // small jitter around the drift line
        const jitter = (Math.random() - 0.5) * 4;
        v = v * 0.55 + target * 0.45 + jitter;
        v = Math.max(2, Math.min(98, v));
        points.push({
            t: now - (NUM_POINTS - 1 - i) * STEP_MS,
            pct: +v.toFixed(2),
        });
    }
    return points;
}

interface Props {
    volumeLabel: string;
    closeLabel: string;
}

export default function LandingDummyPriceChart({ volumeLabel, closeLabel }: Props): JSX.Element {
    const [range, set_range] = useState<RangeKey>('1m');
    const [selectedOutcome, set_selected_outcome] = useState<Outcome>(Outcome.YES);
    const [now_label, set_now_label] = useState<string>(() =>
        new Date().toLocaleTimeString(undefined, { hour12: false }),
    );

    useEffect(() => {
        const tick = () =>
            set_now_label(new Date().toLocaleTimeString(undefined, { hour12: false }));
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, []);

    // Synthetic history: starts somewhere reasonable, drifts toward ~31% (the
    // approximate seeded YES level). The dummy feed walks the live price from
    // there.
    const yes_points = useMemo(() => build_history(18, 31), []);

    const points = useMemo(() => {
        if (selectedOutcome === Outcome.NO) {
            return yes_points.map((p) => ({ t: p.t, pct: +(100 - p.pct).toFixed(2) }));
        }
        return yes_points;
    }, [yes_points, selectedOutcome]);

    const { yMin, yMax } = useMemo(() => {
        if (points.length === 0) return { yMin: 0, yMax: 100 };
        const min_v = Math.min(...points.map((p) => p.pct));
        const max_v = Math.max(...points.map((p) => p.pct));
        const r = Math.max(1, max_v - min_v);
        return {
            yMin: Math.max(0, min_v - r * 0.15),
            yMax: Math.min(100, max_v + r * 0.15),
        };
    }, [points]);

    const isNo = selectedOutcome === Outcome.NO;
    const lineColor = isNo ? 'rgba(244,63,94,' : 'rgba(39,163,253,';
    const areaColor = lineColor;

    return (
        <section className="rounded-lg bg-dark-base flex flex-col min-h-120">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 gap-4">
                <ProbabilityHeadline marketId={LANDING_DEMO_MARKET_ID} delta24hPct={null} />
                <div className="flex items-center gap-3 text-[11px] tracking-widest text-neutral-400">
                    <span>{volumeLabel} Vol</span>
                    <span className="text-white/30">|</span>
                    <span>{closeLabel}</span>
                    <span className="text-white/30">|</span>
                    <span className="tabular-nums text-white/55">{now_label}</span>
                </div>
            </div>

            <div className="relative w-full flex-1 min-h-0 px-2 select-none outline-none">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={points}
                        margin={{ top: 24, right: 16, bottom: 0, left: 0 }}
                    >
                        <defs>
                            <linearGradient id="landingDummyLine" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0" stopColor={`${lineColor}0.5)`} />
                                <stop offset="0.5" stopColor={`${lineColor}0.9)`} />
                                <stop offset="1" stopColor={`${lineColor}0.7)`} />
                            </linearGradient>
                            <linearGradient id="landingDummyArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0" stopColor={`${areaColor}0.22)`} />
                                <stop offset="1" stopColor={`${areaColor}0.02)`} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            stroke="rgba(255,255,255,0.03)"
                            strokeDasharray="4 3"
                            horizontal
                            vertical={false}
                        />
                        <YAxis
                            domain={[yMin, yMax]}
                            tick={{
                                fill: '#a3a3a3',
                                fontSize: 10,
                                fontFamily: 'var(--m-, monospace)',
                            }}
                            tickFormatter={(v) => `${Math.round(v)}%`}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            tickCount={5}
                        />
                        <Area
                            type="monotone"
                            dataKey="pct"
                            stroke="url(#landingDummyLine)"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="url(#landingDummyArea)"
                            activeDot={false}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/8">
                <div className="relative flex gap-1 bg-white/2.5 border border-white/8 rounded-md p-0.75">
                    {[Outcome.YES, Outcome.NO].map((o) => {
                        const is_selected = selectedOutcome === o;
                        const is_yes = o === Outcome.YES;
                        return (
                            <button
                                key={o}
                                type="button"
                                onClick={() => set_selected_outcome(o)}
                                className={`relative px-3 py-1 rounded text-[9px] tracking-[0.28em] uppercase font-medium transition-colors ${
                                    is_selected
                                        ? 'text-white'
                                        : 'text-white/45'
                                }`}
                            >
                                {is_selected && (
                                    <motion.span
                                        layoutId="landing-dummy-outcome-pill"
                                        className="absolute inset-0 rounded"
                                        style={{
                                            backgroundColor: is_yes
                                                ? 'rgba(15, 122, 86, 0.9)'
                                                : 'rgba(225, 29, 72, 0.8)',
                                        }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 400,
                                            damping: 32,
                                        }}
                                    />
                                )}
                                <span className="relative z-10">{o}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1">
                    <div className="flex gap-1">
                        {RANGES.map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => set_range(r.key)}
                                className={`relative px-2 py-1 rounded text-[9px] tracking-[0.2em] uppercase transition-colors ${
                                    range === r.key ? 'text-white' : 'text-white/45'
                                }`}
                            >
                                {range === r.key && (
                                    <motion.span
                                        layoutId="landing-dummy-range-pill"
                                        className="absolute inset-0 rounded bg-white/[0.07]"
                                        transition={{
                                            type: 'spring',
                                            stiffness: 400,
                                            damping: 32,
                                        }}
                                    />
                                )}
                                <span className="relative z-10">{r.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="relative ml-1">
                        <button
                            aria-label="settings"
                            type="button"
                            className="px-2 py-1 rounded transition-colors flex items-center text-white/45"
                        >
                            <TbSettings className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

'use client';
import { JSX, useState, useMemo, useRef, useLayoutEffect } from 'react';
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
import type { ProbabilityPoint } from '@/utils/constants';
import s from './PriceChart.module.css';
import ms from './market.module.css';

type TimeFilter = '1H' | '1D' | '1W' | 'ALL';
const FILTERS: TimeFilter[] = ['1H', '1D', '1W', 'ALL'];

const MARGIN = { top: 30, right: 24, bottom: 0, left: 0 };

interface Props {
    data: ProbabilityPoint[];
    label?: string;
}

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as ProbabilityPoint;
    return (
        <div className={s.tooltip}>
            <div className={s.tooltipDate}>{point.date}</div>
            <div className={s.tooltipValue}>{point.value}%</div>
        </div>
    );
}

export default function PriceChart({ data, label = 'PRICE HISTORY' }: Props): JSX.Element {
    const [filter, setFilter] = useState<TimeFilter>('ALL');
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const filtered = useMemo(() => {
        if (filter === 'ALL') return data;
        const count = filter === '1H' ? 2 : filter === '1D' ? 4 : 7;
        return data.slice(-Math.min(count, data.length));
    }, [data, filter]);

    const { yMin, yMax } = useMemo(() => {
        const minVal = Math.min(...filtered.map((p) => p.value));
        const maxVal = Math.max(...filtered.map((p) => p.value));
        const range = maxVal - minVal || 1;
        return { yMin: minVal - range * 0.1, yMax: maxVal + range * 0.1 };
    }, [filtered]);

    const tooltipPos = useMemo(() => {
        if (activeIdx == null || !containerSize.width) return undefined;
        const point = filtered[activeIdx];
        if (!point) return undefined;
        const yAxisWidth = 40;
        const plotW = containerSize.width - MARGIN.left - yAxisWidth - MARGIN.right;
        const plotH = containerSize.height - MARGIN.top - MARGIN.bottom;
        const denom = Math.max(filtered.length - 1, 1);
        const x = MARGIN.left + yAxisWidth + (activeIdx / denom) * plotW;
        const y = MARGIN.top + (1 - (point.value - yMin) / (yMax - yMin)) * plotH;
        return { x, y: Math.max(y - 60, 0) };
    }, [activeIdx, containerSize, filtered, yMin, yMax]);

    return (
        <div className={ms.card}>
            <div className={ms.cardHeader}>
                <div className={ms.sectionLabel} style={{ margin: 0 }}>
                    <span className={ms.sectionDot} />
                    {label}
                </div>
            </div>
            <div className={s.wrapper}>
                <div className={s.filters}>
                    {FILTERS.map((f) => (
                        <button
                            key={f}
                            type="button"
                            className={`${s.filterBtn} ${filter === f ? s.filterBtnActive : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                <div className={s.chartContainer} ref={containerRef}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={filtered}
                            margin={MARGIN}
                            onMouseMove={(state) => {
                                const idx = state?.activeTooltipIndex;
                                if (typeof idx === 'number') setActiveIdx(idx);
                            }}
                            onMouseLeave={() => setActiveIdx(null)}
                        >
                            <defs>
                                <linearGradient id="priceLineGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="rgba(255, 204, 0, 0.5)" />
                                    <stop offset="50%" stopColor="rgba(255, 204, 0, 0.9)" />
                                    <stop offset="100%" stopColor="rgba(255, 204, 0, 0.7)" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                stroke="rgba(255, 255, 255, 0.03)"
                                strokeDasharray="4 3"
                                vertical={false}
                            />
                            <XAxis dataKey="date" hide />
                            <YAxis
                                domain={[yMin, yMax]}
                                tick={{
                                    fill: 'rgba(255, 255, 255, 0.15)',
                                    fontSize: 8,
                                    fontFamily: 'var(--m-)',
                                }}
                                tickFormatter={(v) => `${Math.round(v)}%`}
                                tickLine={false}
                                axisLine={false}
                                width={40}
                                tickCount={5}
                            />
                            <Tooltip
                                content={(props) => <ChartTooltip {...props} />}
                                cursor={{
                                    stroke: 'rgba(255, 204, 0, 0.25)',
                                    strokeWidth: 1,
                                }}
                                position={tooltipPos}
                                isAnimationActive={false}
                                wrapperStyle={{ transition: 'none', pointerEvents: 'none' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="url(#priceLineGrad)"
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                fill="url(#priceAreaGrad)"
                                dot={{
                                    r: 2.5,
                                    fill: '#FFCC00',
                                    stroke: 'var(--m-bg)',
                                    strokeWidth: 2,
                                    fillOpacity: 0.6,
                                }}
                                activeDot={{
                                    r: 4.5,
                                    fill: '#FFCC00',
                                    stroke: 'var(--m-bg)',
                                    strokeWidth: 2,
                                }}
                                animationDuration={1200}
                                animationEasing="ease-out"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className={s.xLabels}>
                    {filtered.length > 0 && <span className={s.xLabel}>{filtered[0].date}</span>}
                    {filtered.length > 2 && (
                        <span className={s.xLabel}>
                            {filtered[Math.floor(filtered.length / 2)].date}
                        </span>
                    )}
                    {filtered.length > 1 && (
                        <span className={s.xLabel}>{filtered[filtered.length - 1].date}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

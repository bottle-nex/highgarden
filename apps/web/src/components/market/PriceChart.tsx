'use client';
import { JSX, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ProbabilityPoint } from '@/utils/constants';
import s from './PriceChart.module.css';
import ms from './market.module.css';

type TimeFilter = '1H' | '1D' | '1W' | 'ALL';
const FILTERS: TimeFilter[] = ['1H', '1D', '1W', 'ALL'];

interface Props {
    data: ProbabilityPoint[];
    label?: string;
}

/** Build a smooth catmull-rom → cubic bezier path through all points */
function smoothPath(pts: { x: number; y: number }[], tension = 0.35): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(i + 2, pts.length - 1)];

        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

export default function PriceChart({ data, label = 'PRICE HISTORY' }: Props): JSX.Element {
    const [filter, setFilter] = useState<TimeFilter>('ALL');
    const [hovered, setHovered] = useState<{
        idx: number;
        x: number;
        y: number;
    } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        if (filter === 'ALL') return data;
        const count = filter === '1H' ? 2 : filter === '1D' ? 4 : 7;
        return data.slice(-Math.min(count, data.length));
    }, [data, filter]);

    // Use a wider viewBox so the aspect ratio is natural, not stretched
    const vbW = 600;
    const vbH = 260;
    const pad = { top: 30, right: 24, bottom: 16, left: 24 };
    const chartW = vbW - pad.left - pad.right;
    const chartH = vbH - pad.top - pad.bottom;

    const minVal = Math.min(...filtered.map((p) => p.value));
    const maxVal = Math.max(...filtered.map((p) => p.value));
    const valRange = maxVal - minVal || 1;
    // Add 10% padding above/below so the line doesn't clip edges
    const yMin = minVal - valRange * 0.1;
    const yMax = maxVal + valRange * 0.1;
    const yRange = yMax - yMin;

    const points = filtered.map((p, i) => ({
        x: pad.left + (i / Math.max(filtered.length - 1, 1)) * chartW,
        y: pad.top + (1 - (p.value - yMin) / yRange) * chartH,
        ...p,
    }));

    const linePath = smoothPath(points);
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    const areaPath =
        lastPt && firstPt
            ? `${linePath} L ${lastPt.x} ${pad.top + chartH} L ${firstPt.x} ${pad.top + chartH} Z`
            : '';

    const gridCount = 5;

    const handleDotHover = useCallback((i: number, e: React.MouseEvent<SVGCircleElement>) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        setHovered({
            idx: i,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    }, []);

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
                    <AnimatePresence>
                        {hovered !== null && points[hovered.idx] && (
                            <motion.div
                                className={s.tooltip}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4 }}
                                transition={{ duration: 0.12 }}
                                style={{
                                    left: hovered.x,
                                    top: hovered.y - 56,
                                }}
                            >
                                <div className={s.tooltipDate}>{points[hovered.idx].date}</div>
                                <div className={s.tooltipValue}>{points[hovered.idx].value}%</div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {hovered !== null && (
                        <div className={s.crosshair} style={{ left: hovered.x }} />
                    )}

                    <svg
                        className={s.svg}
                        viewBox={`0 0 ${vbW} ${vbH}`}
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(224, 58, 0, 0.18)" />
                                <stop offset="40%" stopColor="rgba(224, 58, 0, 0.06)" />
                                <stop offset="100%" stopColor="rgba(224, 58, 0, 0)" />
                            </linearGradient>
                            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="rgba(224, 58, 0, 0.5)" />
                                <stop offset="50%" stopColor="rgba(224, 58, 0, 0.9)" />
                                <stop offset="100%" stopColor="rgba(224, 58, 0, 0.7)" />
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Grid lines */}
                        {Array.from({ length: gridCount }).map((_, i) => {
                            const y = pad.top + (i / (gridCount - 1)) * chartH;
                            return (
                                <line
                                    key={i}
                                    className={s.gridLine}
                                    x1={pad.left}
                                    y1={y}
                                    x2={vbW - pad.right}
                                    y2={y}
                                />
                            );
                        })}

                        {/* Y-axis labels */}
                        {Array.from({ length: gridCount }).map((_, i) => {
                            const y = pad.top + (i / (gridCount - 1)) * chartH;
                            const val = Math.round(yMax - (i / (gridCount - 1)) * yRange);
                            return (
                                <text
                                    key={`yl-${i}`}
                                    x={pad.left - 6}
                                    y={y + 1}
                                    className={s.yLabel}
                                    textAnchor="end"
                                    dominantBaseline="middle"
                                >
                                    {val}%
                                </text>
                            );
                        })}

                        {points.length > 1 && (
                            <>
                                {/* Area fill */}
                                <motion.path
                                    d={areaPath}
                                    fill="url(#areaGrad)"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.8, delay: 0.3 }}
                                />
                                {/* Glow line behind */}
                                <motion.path
                                    d={linePath}
                                    fill="none"
                                    stroke="rgba(224, 58, 0, 0.15)"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    filter="url(#glow)"
                                    initial={{ pathLength: 0, opacity: 0 }}
                                    animate={{ pathLength: 1, opacity: 1 }}
                                    transition={{ duration: 1.2, ease: 'easeOut' }}
                                />
                                {/* Main line */}
                                <motion.path
                                    d={linePath}
                                    fill="none"
                                    stroke="url(#lineGrad)"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1.2, ease: 'easeOut' }}
                                />
                            </>
                        )}

                        {/* Data points */}
                        {points.map((p, i) => (
                            <g key={i}>
                                {/* Hover hit area (larger invisible circle) */}
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={12}
                                    fill="transparent"
                                    onMouseEnter={(e) =>
                                        handleDotHover(
                                            i,
                                            e as unknown as React.MouseEvent<SVGCircleElement>,
                                        )
                                    }
                                    onMouseMove={(e) =>
                                        handleDotHover(
                                            i,
                                            e as unknown as React.MouseEvent<SVGCircleElement>,
                                        )
                                    }
                                    onMouseLeave={() => setHovered(null)}
                                    style={{ cursor: 'pointer' }}
                                />
                                {/* Visible dot */}
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={hovered?.idx === i ? 4.5 : 2.5}
                                    className={s.chartDot}
                                    style={{
                                        opacity: hovered?.idx === i ? 1 : 0.6,
                                    }}
                                />
                                {/* Glow ring on hover */}
                                {hovered?.idx === i && (
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={10}
                                        fill="none"
                                        stroke="rgba(224, 58, 0, 0.2)"
                                        strokeWidth="1.5"
                                    />
                                )}
                            </g>
                        ))}
                    </svg>
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

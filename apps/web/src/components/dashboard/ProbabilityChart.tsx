'use client';
import { JSX, useMemo, useState } from 'react';
import type { ProbabilityPoint } from '@/utils/constants';

interface Props {
    data: ProbabilityPoint[];
    height?: number;
}

const PADDING = { top: 24, right: 24, bottom: 36, left: 44 };

export default function ProbabilityChart({ data, height = 240 }: Props): JSX.Element {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const width = 720;

    const { points, areaPath, linePath, yTicks } = useMemo(() => {
        const w = width - PADDING.left - PADDING.right;
        const h = height - PADDING.top - PADDING.bottom;

        const values = data.map((d) => d.value);
        const min = 0;
        const max = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10 + 10);

        const pts = data.map((d, i) => {
            const x = PADDING.left + (i / (data.length - 1)) * w;
            const y = PADDING.top + (1 - (d.value - min) / (max - min)) * h;
            return { x, y, ...d };
        });

        const linePathStr = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

        const areaPathStr =
            linePathStr +
            ` L${pts[pts.length - 1].x},${PADDING.top + h}` +
            ` L${pts[0].x},${PADDING.top + h} Z`;

        const ticks = [0, 25, 50, 75, 100].map((v) => ({
            value: v,
            y: PADDING.top + (1 - (v - min) / (max - min)) * h,
        }));

        return { points: pts, areaPath: areaPathStr, linePath: linePathStr, yTicks: ticks };
    }, [data, height]);

    const hovered = hoverIdx != null ? points[hoverIdx] : null;

    return (
        <div className="relative w-full">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto"
                preserveAspectRatio="none"
                onMouseLeave={() => setHoverIdx(null)}
            >
                <defs>
                    <linearGradient id="prob-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff4100" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#ff4100" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {yTicks.map((t) => (
                    <g key={t.value}>
                        <line
                            x1={PADDING.left}
                            x2={width - PADDING.right}
                            y1={t.y}
                            y2={t.y}
                            stroke="rgba(255,255,255,0.08)"
                            strokeDasharray="2 4"
                        />
                        <text
                            x={PADDING.left - 8}
                            y={t.y + 3}
                            textAnchor="end"
                            className="fill-white/40 font-mono"
                            fontSize="9"
                        >
                            {t.value}%
                        </text>
                    </g>
                ))}

                <path d={areaPath} fill="url(#prob-area)" />
                <path
                    d={linePath}
                    fill="none"
                    stroke="#ff4100"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {points.map((p, i) => (
                    <g key={i}>
                        <rect
                            x={p.x - 20}
                            y={0}
                            width={40}
                            height={height}
                            fill="transparent"
                            onMouseEnter={() => setHoverIdx(i)}
                        />
                        {i % 2 === 0 && (
                            <text
                                x={p.x}
                                y={height - 8}
                                textAnchor="middle"
                                className="fill-white/40 font-mono"
                                fontSize="9"
                            >
                                {p.date}
                            </text>
                        )}
                    </g>
                ))}

                {hovered && (
                    <g>
                        <line
                            x1={hovered.x}
                            x2={hovered.x}
                            y1={PADDING.top}
                            y2={height - PADDING.bottom}
                            stroke="rgba(255,255,255,0.35)"
                            strokeDasharray="2 3"
                        />
                        <circle
                            cx={hovered.x}
                            cy={hovered.y}
                            r="4"
                            fill="#0a0a0a"
                            stroke="#ff4100"
                            strokeWidth="1.5"
                        />
                    </g>
                )}
            </svg>

            {hovered && (
                <div
                    className="pointer-events-none absolute top-2 bg-black border border-white/20 rounded px-2 py-1.5 font-mono text-[9px] tracking-[0.15em] uppercase"
                    style={{
                        left: `${(hovered.x / width) * 100}%`,
                        transform: 'translateX(-50%)',
                    }}
                >
                    <div className="text-white/45">{hovered.date}</div>
                    <div className="text-alpha">{hovered.value}% YES</div>
                </div>
            )}
        </div>
    );
}

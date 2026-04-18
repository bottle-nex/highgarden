'use client';
import { JSX } from 'react';
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

interface Props {
    data: ProbabilityPoint[];
    height?: number;
}

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as ProbabilityPoint;
    return (
        <div className="bg-neutral-950 border border-white/20 rounded px-2 py-1.5 font-mono text-[9px] tracking-[0.15em] uppercase">
            <div className="text-white/45">{point.date}</div>
            <div style={{ color: '#FFCC00' }}>{point.value}% YES</div>
        </div>
    );
}

export default function ProbabilityChart({ data, height = 240 }: Props): JSX.Element {
    const values = data.map((d) => d.value);
    const yMax = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10 + 10);

    return (
        <div className="relative w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 24, right: 24, bottom: 12, left: 8 }}>
                    <CartesianGrid
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="2 4"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="date"
                        tick={{
                            fill: 'rgba(255,255,255,0.5)',
                            fontSize: 12,
                            fontFamily: 'monospace',
                        }}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
                    />
                    <YAxis
                        domain={[0, yMax]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{
                            fill: 'rgba(255,255,255,0.5)',
                            fontSize: 12,
                            fontFamily: 'monospace',
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                    />
                    <Tooltip
                        content={(props) => <ChartTooltip {...props} />}
                        cursor={{
                            stroke: 'rgba(255,255,255,0.35)',
                            strokeDasharray: '2 3',
                            strokeWidth: 1,
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#FFCC00"
                        strokeWidth={2}
                        fill="url(#prob-area)"
                        activeDot={{ r: 4, fill: '#0a0a0a', stroke: '#FFCC00', strokeWidth: 1.5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

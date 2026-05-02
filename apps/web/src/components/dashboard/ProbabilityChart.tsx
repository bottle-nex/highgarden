'use client';
import { JSX, useEffect, useRef, useState } from 'react';
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
    height?: number | string;
}

const YELLOW_RGBA = 'rgba(255,204,0,';

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as ProbabilityPoint;
    return (
        <div className="bg-neutral-950 border border-white/20 rounded px-2 py-1.5  text-[9px] tracking-[0.15em] uppercase">
            <div className="text-white/45">{point.date}</div>
            <div style={{ color: '#FFCC00' }}>{point.value}% YES</div>
        </div>
    );
}

export default function ProbabilityChart({ data, height = 240 }: Props): JSX.Element {
    const values = data.map((d) => d.value);
    const minV = values.length > 0 ? Math.min(...values) : 0;
    const maxV = values.length > 0 ? Math.max(...values) : 100;
    const pad = Math.max(1, (maxV - minV) * 0.1);
    const yMin = Math.max(0, minV - pad);
    const yMax = Math.min(100, maxV + pad);

    const wrapper_ref = useRef<HTMLDivElement>(null);
    const [chart_svg_width, set_chart_svg_width] = useState(0);
    const [active_coord, set_active_coord] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const el = wrapper_ref.current;
        if (!el) return;
        const update = (): void => {
            set_chart_svg_width(Math.max(0, el.clientWidth));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={wrapper_ref} className="relative w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{ top: 24, right: 24, bottom: 12, left: 8 }}
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
                            id="probLine"
                            x1="0"
                            y1="0"
                            x2={chart_svg_width || 1}
                            y2="0"
                            gradientUnits="userSpaceOnUse"
                        >
                            {active_coord && chart_svg_width > 0 ? (
                                <>
                                    <stop offset="0" stopColor={`${YELLOW_RGBA}0.9)`} />
                                    <stop
                                        offset={Math.max(
                                            0,
                                            active_coord.x / chart_svg_width - 0.004,
                                        )}
                                        stopColor={`${YELLOW_RGBA}0.9)`}
                                    />
                                    <stop
                                        offset={Math.min(
                                            1,
                                            active_coord.x / chart_svg_width + 0.004,
                                        )}
                                        stopColor={`${YELLOW_RGBA}0.15)`}
                                    />
                                    <stop offset="1" stopColor={`${YELLOW_RGBA}0.15)`} />
                                </>
                            ) : (
                                <>
                                    <stop offset="0" stopColor={`${YELLOW_RGBA}0.6)`} />
                                    <stop offset="0.5" stopColor={`${YELLOW_RGBA}0.95)`} />
                                    <stop offset="1" stopColor={`${YELLOW_RGBA}0.7)`} />
                                </>
                            )}
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="2 4"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="date"
                        tick={{
                            fill: 'rgba(255,255,255,0.5)',
                            fontSize: 11,
                            fontFamily: 'monospace',
                        }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={48}
                    />
                    <YAxis
                        domain={[yMin, yMax]}
                        tickCount={5}
                        tickFormatter={(v) => `${Math.round(v)}%`}
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
                            stroke: 'rgba(255,204,0,0.35)',
                            strokeDasharray: '2 3',
                            strokeWidth: 1,
                        }}
                        isAnimationActive={false}
                        wrapperStyle={{ transition: 'none', pointerEvents: 'none' }}
                        position={
                            active_coord
                                ? { x: active_coord.x + 14, y: active_coord.y - 22 }
                                : undefined
                        }
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke="url(#probLine)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        activeDot={{ r: 4, fill: '#0a0a0a', stroke: '#FFCC00', strokeWidth: 1.5 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

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

const LINE_RGBA = 'rgba(255,214,8,';
const AREA_RGBA = LINE_RGBA;

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as ProbabilityPoint;
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
                {point.date}
            </div>
            <div
                style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.92)',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {point.value.toFixed(1)}%
            </div>
        </div>
    );
}

export default function ProbabilityChart({ data, height = 240 }: Props): JSX.Element {
    const values = data.map((d) => d.value);
    const min_v = values.length > 0 ? Math.min(...values) : 0;
    const max_v = values.length > 0 ? Math.max(...values) : 100;
    const pad = Math.max(1, (max_v - min_v) * 0.1);
    const y_min = Math.max(0, min_v - pad);
    const y_max = Math.min(100, max_v + pad);

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
        <div
            ref={wrapper_ref}
            className="relative w-full select-none outline-none"
            style={{ height }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
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
                            id="probLine"
                            x1="0"
                            y1="0"
                            x2={chart_svg_width || 1}
                            y2="0"
                            gradientUnits="userSpaceOnUse"
                        >
                            {active_coord && chart_svg_width > 0 ? (
                                <>
                                    <stop offset="0" stopColor={`${LINE_RGBA}0.9)`} />
                                    <stop
                                        offset={Math.max(
                                            0,
                                            active_coord.x / chart_svg_width - 0.004,
                                        )}
                                        stopColor={`${LINE_RGBA}0.9)`}
                                    />
                                    <stop
                                        offset={Math.min(
                                            1,
                                            active_coord.x / chart_svg_width + 0.004,
                                        )}
                                        stopColor={`${LINE_RGBA}0.1)`}
                                    />
                                    <stop offset="1" stopColor={`${LINE_RGBA}0.1)`} />
                                </>
                            ) : (
                                <>
                                    <stop offset="0" stopColor={`${LINE_RGBA}0.5)`} />
                                    <stop offset="0.5" stopColor={`${LINE_RGBA}0.9)`} />
                                    <stop offset="1" stopColor={`${LINE_RGBA}0.7)`} />
                                </>
                            )}
                        </linearGradient>
                        <linearGradient
                            id="probArea"
                            x1="0"
                            y1="0"
                            x2={chart_svg_width || 1}
                            y2="0"
                            gradientUnits="userSpaceOnUse"
                        >
                            {active_coord && chart_svg_width > 0 ? (
                                <>
                                    <stop offset="0" stopColor={`${AREA_RGBA}0.18)`} />
                                    <stop
                                        offset={Math.max(
                                            0,
                                            active_coord.x / chart_svg_width - 0.004,
                                        )}
                                        stopColor={`${AREA_RGBA}0.18)`}
                                    />
                                    <stop
                                        offset={Math.min(
                                            1,
                                            active_coord.x / chart_svg_width + 0.004,
                                        )}
                                        stopColor={`${AREA_RGBA}0.02)`}
                                    />
                                    <stop offset="1" stopColor={`${AREA_RGBA}0.02)`} />
                                </>
                            ) : (
                                <>
                                    <stop offset="0" stopColor={`${AREA_RGBA}0.18)`} />
                                    <stop offset="1" stopColor={`${AREA_RGBA}0.18)`} />
                                </>
                            )}
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        stroke="rgba(255,255,255,0.03)"
                        strokeDasharray="4 3"
                        horizontal
                        vertical={false}
                    />
                    <XAxis dataKey="date" hide />
                    <YAxis
                        domain={[y_min, y_max]}
                        tick={{
                            fill: 'rgba(255,255,255,0.18)',
                            fontSize: 9,
                            fontFamily: 'var(--m-, monospace)',
                        }}
                        tickFormatter={(v) => `${Math.round(v)}%`}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickCount={5}
                    />
                    <Tooltip
                        content={(props) => <ChartTooltip {...props} />}
                        cursor={{ stroke: 'rgba(255,214,8,0.3)', strokeWidth: 1 }}
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
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="url(#probArea)"
                        activeDot={{
                            r: 4.5,
                            fill: '#ffd608',
                            stroke: '#0E0D0D',
                            strokeWidth: 2,
                        }}
                        animationDuration={600}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

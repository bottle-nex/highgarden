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

const LINE_RGBA = 'rgba(39,163,253,';
const AREA_RGBA = LINE_RGBA;

function ChartTooltip({ active, payload }: TooltipContentProps): JSX.Element | null {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload as ProbabilityPoint;
    return (
        <div
            style={{
                background: 'rgba(6,6,8,0.94)',
                border: '1px solid rgba(39,163,253,0.18)',
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
                    color: 'rgba(39,163,253,0.55)',
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
    const [exit_opacity, set_exit_opacity] = useState(1);
    const exit_raf_ref = useRef<number | null>(null);

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

    useEffect(() => {
        return () => {
            if (exit_raf_ref.current !== null) cancelAnimationFrame(exit_raf_ref.current);
        };
    }, []);

    const cancel_exit_animation = (): void => {
        if (exit_raf_ref.current !== null) {
            cancelAnimationFrame(exit_raf_ref.current);
            exit_raf_ref.current = null;
        }
        set_exit_opacity(1);
    };

    const start_exit_animation = (from: { x: number; y: number }): void => {
        cancel_exit_animation();
        if (chart_svg_width <= 0) {
            set_active_coord(null);
            return;
        }
        const start_x = from.x;
        const target_x = chart_svg_width;
        const start_t = performance.now();
        const dur = 380;
        const tick = (now: number): void => {
            const elapsed = now - start_t;
            const t = Math.min(1, elapsed / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            const cur_x = start_x + (target_x - start_x) * eased;
            set_active_coord({ x: cur_x, y: from.y });
            set_exit_opacity(1 - eased);
            if (t < 1) {
                exit_raf_ref.current = requestAnimationFrame(tick);
            } else {
                set_active_coord(null);
                set_exit_opacity(1);
                exit_raf_ref.current = null;
            }
        };
        exit_raf_ref.current = requestAnimationFrame(tick);
    };

    const active_coord_ref = useRef(active_coord);
    const start_exit_ref = useRef(start_exit_animation);

    useEffect(() => {
        active_coord_ref.current = active_coord;
    }, [active_coord]);

    useEffect(() => {
        start_exit_ref.current = start_exit_animation;
    });

    useEffect(() => {
        const handler = (e: PointerEvent): void => {
            if (!active_coord_ref.current || exit_raf_ref.current !== null) return;
            const el = wrapper_ref.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const inside =
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom;
            if (!inside) start_exit_ref.current(active_coord_ref.current);
        };
        document.addEventListener('pointermove', handler);
        return () => document.removeEventListener('pointermove', handler);
    }, []);

    return (
        <div
            ref={wrapper_ref}
            className="relative w-full select-none outline-none"
            style={{ height }}
            onMouseEnter={cancel_exit_animation}
            onMouseLeave={() => {
                if (active_coord) start_exit_animation(active_coord);
                else set_active_coord(null);
            }}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={data}
                    margin={{ top: 24, right: 16, bottom: 0, left: 0 }}
                    onMouseMove={(state) => {
                        if (!state.activeCoordinate) return;
                        const raw_idx = state.activeTooltipIndex;
                        const idx =
                            typeof raw_idx === 'number'
                                ? raw_idx
                                : typeof raw_idx === 'string'
                                  ? parseInt(raw_idx, 10)
                                  : NaN;
                        const point = Number.isInteger(idx) && idx >= 0 ? data[idx] : undefined;
                        if (!point) return;
                        const wrapper_h = wrapper_ref.current?.clientHeight ?? 0;
                        const top_margin = 24;
                        const plot_h = Math.max(1, wrapper_h - top_margin);
                        const y_range = Math.max(1e-6, y_max - y_min);
                        const y_on_line = top_margin + ((y_max - point.value) / y_range) * plot_h;
                        cancel_exit_animation();
                        set_active_coord({
                            x: state.activeCoordinate.x,
                            y: y_on_line,
                        });
                    }}
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
                        cursor={false}
                        isAnimationActive={false}
                        wrapperStyle={{
                            transition: 'opacity 120ms',
                            opacity: exit_opacity,
                            pointerEvents: 'none',
                        }}
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
                        activeDot={false}
                        animationDuration={600}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
            {active_coord && chart_svg_width > 0 && (
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ opacity: exit_opacity }}
                >
                    <div
                        className="absolute top-0 bottom-0 w-px"
                        style={{
                            left: active_coord.x,
                            background: 'rgba(39,163,253,0.3)',
                        }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{
                            left: active_coord.x,
                            top: active_coord.y,
                            width: 9,
                            height: 9,
                            transform: 'translate(-50%, -50%)',
                            background: '#27A3FD',
                            boxShadow: '0 0 0 2px #0E0D0D',
                        }}
                    />
                </div>
            )}
        </div>
    );
}

'use client';

import { JSX, ReactNode, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type CroppedPanelProps = HTMLAttributes<HTMLDivElement> & {
    children: ReactNode;
    cut?: number;
    radius?: number;
    stroke_width?: number;
};

export function CroppedPanel({
    className,
    children,
    cut = 64,
    radius = 3,
    stroke_width = 1,
    ...props
}: CroppedPanelProps): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const [box, set_box] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [stroke_color, set_stroke_color] = useState<string>('rgba(0, 0, 0, 0)');

    const ready = box.w > 0 && box.h > 0;
    const path_d = ready ? build_path(box.w, box.h, radius, cut) : '';

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            set_box({ w: r.width, h: r.height });
            set_stroke_color(cs.borderTopColor);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.borderWidth = '0';
        if (path_d) {
            const value = `path('${path_d}')`;
            el.style.clipPath = value;
            el.style.setProperty('-webkit-clip-path', value);
        } else {
            el.style.clipPath = '';
            el.style.removeProperty('-webkit-clip-path');
        }
    });

    return (
        <div ref={ref} className={cn('relative isolate', className)} {...props}>
            {ready && (
                <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full z-50"
                    width={box.w}
                    height={box.h}
                    viewBox={`0 0 ${box.w} ${box.h}`}
                    preserveAspectRatio="none"
                >
                    <path
                        d={path_d}
                        fill="none"
                        stroke={stroke_color}
                        strokeWidth={stroke_width * 2}
                        vectorEffect="non-scaling-stroke"
                        shapeRendering="geometricPrecision"
                    />
                </svg>
            )}
            {children}
        </div>
    );
}

function build_path(w: number, h: number, r: number, c: number): string {
    const rad = clamp(r, 0, Math.min(w / 2, h / 2));
    const cut_size = clamp(c, 0, Math.min(w / 2, h / 2));
    const k = 0.5522847 * cut_size;

    return [
        `M ${rad} 0`,
        `L ${w - cut_size} 0`,
        `C ${w - cut_size + k} 0 ${w} ${cut_size - k} ${w} ${cut_size}`,
        `L ${w} ${h - rad}`,
        `Q ${w} ${h} ${w - rad} ${h}`,
        `L ${rad} ${h}`,
        `Q 0 ${h} 0 ${h - rad}`,
        `L 0 ${rad}`,
        `Q 0 0 ${rad} 0`,
        `Z`,
    ].join(' ');
}

function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
}

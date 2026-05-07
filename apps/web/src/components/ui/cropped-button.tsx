'use client';

import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cropped_button_variants = cva(
    'group/cropped relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center border-transparent font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px',
    {
        variants: {
            size: {
                sm: 'h-8 gap-1.5 px-3 text-xs',
                default: 'h-9 gap-2 px-4 text-sm',
                lg: 'h-10 gap-2 px-6 text-sm',
            },
        },
        defaultVariants: {
            size: 'default',
        },
    },
);

export type CroppedButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof cropped_button_variants> & {
        cut?: number;
        radius?: number;
        smooth?: number;
        stroke_width?: number;
    };

export function CroppedButton({
    className,
    size,
    cut = 12,
    radius = 3,
    smooth = 2,
    stroke_width = 1,
    type = 'button',
    children,
    ...props
}: CroppedButtonProps) {
    const ref = useRef<HTMLButtonElement>(null);
    const [box, set_box] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [stroke_color, set_stroke_color] = useState<string>('rgba(0, 0, 0, 0)');

    const ready = box.w > 0 && box.h > 0;
    const path_d = ready ? build_path(box.w, box.h, radius, cut, smooth) : '';

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
        const events = [
            'mouseenter',
            'mouseleave',
            'focusin',
            'focusout',
            'mousedown',
            'mouseup',
        ] as const;
        events.forEach((e) => el.addEventListener(e, update));
        return () => {
            ro.disconnect();
            events.forEach((e) => el.removeEventListener(e, update));
        };
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
        <button
            ref={ref}
            type={type}
            className={cn(cropped_button_variants({ size }), className, 'active:scale-99')}
            {...props}
        >
            {ready && (
                <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full"
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
        </button>
    );
}

function build_path(w: number, h: number, r: number, c: number, k: number): string {
    const rad = clamp(r, 0, Math.min(w / 2, h / 2));
    const cut_size = clamp(c, 0, Math.min(w / 2, h / 2));
    const sm = clamp(k, 0, Math.min(cut_size / 2, (w - cut_size) / 2, (h - cut_size) / 2));
    const off = sm / Math.SQRT2;

    return [
        `M ${rad} 0`,
        `L ${w - rad} 0`,
        `Q ${w} 0 ${w} ${rad}`,
        `L ${w} ${h - cut_size - sm}`,
        `Q ${w} ${h - cut_size} ${w - off} ${h - cut_size + off}`,
        `L ${w - cut_size + off} ${h - off}`,
        `Q ${w - cut_size} ${h} ${w - cut_size - sm} ${h}`,
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

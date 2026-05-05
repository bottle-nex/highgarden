'use client';
import { JSX, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { cn } from '@/lib/utils';
import { bitcountGridDouble } from './LandingCtaSection';

type Alignment = 'left' | 'center' | 'right';

interface StatRow {
    value: string;
    label: string;
    align: Alignment;
}

const stats: StatRow[] = [
    { value: '25M', label: 'USDC TRADED', align: 'right' },
    { value: '5K', label: 'MARKETS RESOLVED', align: 'center' },
    { value: '12K', label: 'ACTIVE TRADERS', align: 'left' },
];

const row_align_class: Record<Alignment, string> = {
    left: 'justify-start text-left',
    center: 'justify-center text-center',
    right: 'justify-end text-right',
};

const block_align_class: Record<Alignment, string> = {
    left: 'items-start',
    center: 'items-center',
    right: 'items-end',
};

const rise_transition = {
    type: 'spring' as const,
    stiffness: 80,
    damping: 22,
    mass: 0.9,
};

export default function LandingMagicLanes(): JSX.Element {
    return (
        <main className="w-screen h-screen bg-neutral-50 relative z-30">
            <div className="grid grid-rows-3 w-full max-w-7xl mx-auto h-full px-6">
                <HeadingStatRow stat={stats[0]!} />
                <StatRow stat={stats[1]!} />
                <StatRow stat={stats[2]!} is_last />
            </div>
        </main>
    );
}

const center_band_margin = '-50% 0px -50% 0px';

function HeadingStatRow({ stat }: { stat: StatRow }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const in_view = useInView(ref, { margin: center_band_margin, once: true });

    return (
        <div
            ref={ref}
            className="border-b border-neutral-300 flex items-center justify-between gap-8 overflow-hidden relative"
        >
            <div className="overflow-hidden">
                <motion.h2
                    initial={{ y: '100%' }}
                    animate={{ y: in_view ? '0%' : '100%' }}
                    transition={rise_transition}
                    style={{ willChange: 'transform' }}
                    className="max-w-xl text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.05] font-medium text-black"
                >
                    <span className="text-[#ff4000]">Battle tested:</span>{' '}
                    <span>day-one depth, settled in milliseconds.</span>
                </motion.h2>
            </div>
            <StatBlock stat={stat} in_view={in_view} />
        </div>
    );
}

function StatRow({ stat, is_last = false }: { stat: StatRow; is_last?: boolean }): JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    const in_view = useInView(ref, { margin: center_band_margin, once: true });

    return (
        <div
            ref={ref}
            className={cn(
                'flex items-center overflow-hidden relative',
                !is_last && 'border-b border-neutral-300',
                row_align_class[stat.align],
            )}
        >
            <StatBlock stat={stat} in_view={in_view} />
        </div>
    );
}

function StatBlock({ stat, in_view }: { stat: StatRow; in_view: boolean }): JSX.Element {
    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: in_view ? '0%' : '100%' }}
            transition={rise_transition}
            style={{ willChange: 'transform' }}
            className={cn('flex flex-col gap-2', block_align_class[stat.align])}
        >
            <div className="flex items-start leading-none">
                <span className="text-[5rem] md:text-[8rem] lg:text-[10rem] font-light tracking-tighter text-black tabular-nums">
                    {stat.value}
                </span>
                <span className="text-3xl md:text-5xl lg:text-6xl text-neutral-300 font-light mt-1 ml-1">
                    +
                </span>
            </div>
            <span
                className={cn(
                    'text-lg md:text-xl lg:text-2xl tracking-[0.18em] uppercase text-[#ff4000]',
                    bitcountGridDouble.className,
                )}
            >
                {stat.label}
            </span>
        </motion.div>
    );
}

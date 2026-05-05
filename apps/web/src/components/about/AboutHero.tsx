'use client';

import { JSX } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { doto } from '../hero/LandingTextContent';

type Props = {
    eyebrow: string;
    title: string;
    description?: string;
    meta_left?: { label: string; value: string };
    meta_right?: { label: string; value: string };
};

const stagger = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as const },
    },
};

export default function AboutHero({
    eyebrow,
    title,
    description,
    meta_left,
    meta_right,
}: Props): JSX.Element {
    return (
        <motion.header
            className="relative border-b border-white/10 pb-12"
            initial="hidden"
            animate="visible"
            variants={stagger}
        >
            <motion.div
                className="flex items-center gap-x-3 text-[10px] uppercase tracking-[0.25em] text-white/40"
                variants={item}
            >
                <span className="h-px w-6 bg-white/30" />
                <span>{eyebrow}</span>
            </motion.div>

            <motion.h1
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
                className={cn(
                    'mt-6 max-w-5xl text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[0.95]',
                    doto.className,
                )}
            >
                {title}
            </motion.h1>

            {description ? (
                <motion.p
                    className="mt-6 max-w-2xl text-[15px] leading-[1.7] text-white/55"
                    variants={item}
                >
                    {description}
                </motion.p>
            ) : null}

            {meta_left || meta_right ? (
                <motion.div
                    className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[10px] uppercase tracking-[0.25em] text-white/40"
                    variants={item}
                >
                    {meta_left ? (
                        <div className="flex items-center gap-x-3">
                            <span className="text-white/30">{meta_left.label}</span>
                            <span className="h-px w-3 bg-white/20" />
                            <span className="text-white/80">{meta_left.value}</span>
                        </div>
                    ) : null}
                    {meta_right ? (
                        <div className="flex items-center gap-x-3">
                            <span className="text-white/30">{meta_right.label}</span>
                            <span className="h-px w-3 bg-white/20" />
                            <span className="text-white/80">{meta_right.value}</span>
                        </div>
                    ) : null}
                </motion.div>
            ) : null}
        </motion.header>
    );
}

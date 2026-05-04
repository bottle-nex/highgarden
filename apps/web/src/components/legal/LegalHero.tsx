'use client';

import { JSX } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { doto } from '../hero/LandingTextContent';

type Props = {
    eyebrow: string;
    title: string;
    effective_date: string;
    version: string;
    description?: string;
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

export default function LegalHero({
    eyebrow,
    title,
    effective_date,
    version,
    description,
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
                className={cn(
                    "mt-6 max-w-5xl text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-black leading-[0.95] text-white",
                    doto.className
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

            <motion.div
                className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[10px] uppercase tracking-[0.25em] text-white/40"
                variants={item}
            >
                <div className="flex items-center gap-x-3">
                    <span className="text-white/30">EFFECTIVE</span>
                    <span className="h-px w-3 bg-white/20" />
                    <span className="text-white/80">{effective_date}</span>
                </div>
                <div className="flex items-center gap-x-3">
                    <span className="text-white/30">VERSION</span>
                    <span className="h-px w-3 bg-white/20" />
                    <span className="text-white/80">{version}</span>
                </div>
            </motion.div>
        </motion.header>
    );
}

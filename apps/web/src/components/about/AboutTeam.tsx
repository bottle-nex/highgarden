'use client';

import { JSX } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { doto } from '../hero/LandingTextContent';
import EngineerCard, { Engineer } from './EngineerCard';

type Props = {
    index: number;
    engineers: Engineer[];
};

export default function AboutTeam({ index, engineers }: Props): JSX.Element {
    const number = String(index).padStart(2, '0');

    return (
        <motion.section
            id="team"
            className="scroll-mt-28 border-t border-white/10 pt-12"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
            <div className="mb-6 flex items-center gap-x-3">
                <span className="text-[10px] tabular-nums tracking-[0.25em] text-alpha/80">
                    {number}
                </span>
                <span className="h-px w-6 bg-white/20" />
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                    THE TEAM
                </span>
            </div>

            <h2
                className={cn(
                    'mb-4 max-w-3xl text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1]',
                    doto.className,
                )}
            >
                Three engineers, one prediction market.
            </h2>

            <p className="mb-12 max-w-2xl text-[14px] leading-[1.75] text-white/55">
                A small, opinionated team building every layer of the protocol — from the
                on-chain order book to the interface you&apos;re reading this on.
            </p>

            <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-3">
                {engineers.map((engineer, idx) => (
                    <EngineerCard key={engineer.id} engineer={engineer} index={idx} />
                ))}
            </div>
        </motion.section>
    );
}

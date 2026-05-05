'use client';

import { JSX, ReactNode } from 'react';
import { motion } from 'motion/react';

type Props = {
    id: string;
    index: number;
    title: string;
    eyebrow?: string;
    children: ReactNode;
};

export default function LegalSection({ id, index, title, eyebrow, children }: Props): JSX.Element {
    const number = String(index).padStart(2, '0');

    return (
        <motion.section
            id={id}
            className="scroll-mt-28 border-t border-white/10 pt-12 first:border-t-0 first:pt-0"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
            <div className="mb-6 flex items-center gap-x-3">
                <span className="text-[10px] tabular-nums tracking-[0.25em] text-alpha/80">
                    {number}
                </span>
                <span className="h-px w-6 bg-white/20" />
                {eyebrow ? (
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                        {eyebrow}
                    </span>
                ) : null}
            </div>
            <h2 className="mb-6 text-2xl font-medium tracking-tight text-white md:text-3xl">
                {title}
            </h2>
            <div className="space-y-5 text-[14px] leading-[1.75] text-white/65 [&_a]:text-alpha [&_a]:underline-offset-4 hover:[&_a]:underline [&_strong]:font-medium [&_strong]:text-white/90">
                {children}
            </div>
        </motion.section>
    );
}

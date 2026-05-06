'use client';

import { JSX } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { PiXLogo, PiLinkedinLogo, PiGithubLogo } from 'react-icons/pi';
import { cn } from '@/lib/utils';

export type Engineer = {
    id: string;
    name: string;
    role: string;
    image: string;
    bio: string;
    socials: { x?: string; linkedin?: string; github?: string };
};

type Props = {
    engineer: Engineer;
    index: number;
};

export default function EngineerCard({ engineer, index }: Props): JSX.Element {
    return (
        <motion.article
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
                duration: 0.7,
                delay: index * 0.08,
                ease: [0.25, 0.1, 0.25, 1],
            }}
            className="group/card relative border border-white/10 bg-white/2 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-alpha/60"
        >
            <CardCorners />

            <div className="relative aspect-4/5 w-full overflow-hidden border border-white/10 bg-neutral-900">
                <Image
                    src={engineer.image}
                    alt={engineer.name}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover grayscale transition-all duration-500 group-hover/card:grayscale-0 group-hover/card:scale-[1.02]"
                />
                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-950/60 via-transparent to-transparent" />
            </div>

            <div className="mt-5 flex items-center gap-x-3 text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">
                <span className="text-alpha/80 tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                </span>
                <span className="h-px w-6 bg-white/20" />
                <span>{engineer.role}</span>
            </div>

            <h3 className="mt-3 text-xl font-medium tracking-tight text-white">{engineer.name}</h3>

            <p className="mt-3 text-[13px] leading-[1.7] text-white/65">{engineer.bio}</p>

            <div className="mt-5 flex items-center gap-x-4">
                {engineer.socials.x ? (
                    <a
                        href={engineer.socials.x}
                        aria-label={`${engineer.name} on X`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 transition-colors duration-200 hover:text-alpha"
                    >
                        <PiXLogo className="size-4" />
                    </a>
                ) : null}
                {engineer.socials.linkedin ? (
                    <a
                        href={engineer.socials.linkedin}
                        aria-label={`${engineer.name} on LinkedIn`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 transition-colors duration-200 hover:text-alpha"
                    >
                        <PiLinkedinLogo className="size-4" />
                    </a>
                ) : null}
                {engineer.socials.github ? (
                    <a
                        href={engineer.socials.github}
                        aria-label={`${engineer.name} on GitHub`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 transition-colors duration-200 hover:text-alpha"
                    >
                        <PiGithubLogo className="size-4" />
                    </a>
                ) : null}
            </div>
        </motion.article>
    );
}

function CardCorners(): JSX.Element {
    const base =
        'pointer-events-none absolute w-2 h-2 border-white/40 transition-colors duration-300 group-hover/card:border-alpha';
    return (
        <>
            <span className={cn(base, '-top-px -left-px border-t border-l')} />
            <span className={cn(base, '-top-px -right-px border-t border-r')} />
            <span className={cn(base, '-bottom-px -left-px border-b border-l')} />
            <span className={cn(base, '-bottom-px -right-px border-b border-r')} />
        </>
    );
}

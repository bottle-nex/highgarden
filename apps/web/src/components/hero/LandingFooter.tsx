'use client';
import { JSX, useState } from 'react';
import { MdArrowOutward } from 'react-icons/md';
import { cn } from '@/lib/utils';
import { doto } from './LandingTextContent';
import { APP_NAME } from '@/utils/constants';
import { AnimatePresence, motion } from 'framer-motion';

const NAV_GROUPS = [
    {
        label: 'MARKETS',
        links: [
            { name: 'Explore', href: '#' },
            { name: 'Politics', href: '#' },
            { name: 'Crypto', href: '#' },
            { name: 'Sports', href: '#' },
        ],
    },
    {
        label: 'TRADE',
        links: [
            { name: 'Portfolio', href: '#' },
            { name: 'Leaderboard', href: '#' },
            { name: 'Rewards', href: '#' },
            { name: 'Activity', href: '#' },
        ],
    },
    {
        label: 'RESOURCES',
        links: [
            { name: 'Docs', href: '#' },
            { name: 'How it Works', href: '#' },
            { name: 'FAQ', href: '#' },
            { name: 'Support', href: '#' },
        ],
    },
] as const;

const SOCIALS = [
    { name: 'Twitter', href: '#' },
    { name: 'GitHub', href: '#' },
    { name: 'Discord', href: '#' },
] as const;

export default function LandingFooter(): JSX.Element {
    return (
        <footer className="relative w-full bg-alpha pt-24 pb-10 px-6 md:px-10">
            <div className="max-w-340 mx-auto w-full">
                <BrandRow />
                <div className="my-16 h-px w-full bg-white/10" />
                <NavGrid />
                <div className="mt-16 pt-6 border-t border-white/10">
                    <BottomBar />
                </div>
            </div>
        </footer>
    );
}

function BrandRow(): JSX.Element {
    return (
        <div className="flex flex-col gap-y-6">
            <motion.h2
                initial={{ y: 60, opacity: 1 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: false, amount: 0.3 }}
                transition={{ duration: 0.5 }}
                className={cn(
                    'font-black tracking-tighter leading-[0.9] text-dark-base',
                    'text-6xl sm:text-7xl md:text-[12rem]',
                    doto.className,
                )}
            >
                {APP_NAME}
            </motion.h2>
            <section className='flex items-center justify-between'>
                <p className="text-base md:text-3xl text-dark-base/65 leading-relaxed max-w-xl">
                    Engineered to make future outcomes transparent, tradable, and verifiable.
                </p>
                <button aria-label='test' className='relative h-44 flex-1 rounded-full text-6xl uppercase border-2 border-black overflow-hidden font-semibold'>
                    <video
                        src="/videos/porsche.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                    <span className="relative z-10">Start trading</span>
                </button>
            </section>
        </div>
    );
}

function NavGrid(): JSX.Element {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 md:gap-x-10">
            {NAV_GROUPS.map((g) => (
                <LinkColumn key={g.label} label={g.label} links={g.links} />
            ))}
            <LinkColumn label="CONNECT" links={SOCIALS} />
        </div>
    );
}

interface LinkColumnProps {
    label: string;
    links: readonly { name: string; href: string }[];
}

function LinkColumn({ label, links }: LinkColumnProps): JSX.Element {
    const [hovered_link, set_hovered_link] = useState<string | null>(null);
    return (
        <div className="flex flex-col gap-y-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-black/40 mb-2">
                {label}
            </span>
            {links.map((l) => (
                <a
                    key={l.name}
                    href={l.href}
                    onMouseEnter={() => set_hovered_link(l.name)}
                    onMouseLeave={() => set_hovered_link(null)}
                    className="group/link inline-flex items-center gap-x-1.5 text-[16px] text-dark-base/75 hover:text-dark-base transition-colors duration-200 w-fit font-medium"
                >
                    <span>{l.name}</span>
                    <AnimatePresence initial={false}>
                        {hovered_link === l.name && (
                            <motion.span
                                key="arrow"
                                initial={{ opacity: 0, x: -4, width: 0 }}
                                animate={{ opacity: 1, x: 0, width: 'auto' }}
                                exit={{ opacity: 0, x: -4, width: 0 }}
                                transition={{ duration: 0.2 }}
                                className="inline-flex overflow-hidden"
                            >
                                <MdArrowOutward className="size-3.5" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </a>
            ))}
        </div>
    );
}

function BottomBar(): JSX.Element {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-y-3 font-mono text-[10px] uppercase tracking-[0.25em] text-dark-base/40">
            <span>
                © {APP_NAME} 2026 <span className="mx-2 text-dark-base/20">·</span> All rights reserved
            </span>
            <div className="flex items-center gap-x-6">
                <a href="#" className="text-dark-base/40 hover:text-dark-base transition-colors duration-200">
                    Privacy
                </a>
                <a
                    href="/legal/terms"
                    className="text-dark-base/40 hover:text-dark-base transition-colors duration-200"
                >
                    Terms
                </a>
                <a href="#" className="text-dark-base/40 hover:text-dark-base transition-colors duration-200">
                    Disclosures
                </a>
            </div>
        </div>
    );
}

'use client';
import { JSX } from 'react';
import { MdArrowOutward } from 'react-icons/md';
import { cn } from '@/lib/utils';
import { doto } from './LandingTextContent';
import { APP_NAME } from '@/utils/constants';

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
    { name: 'Mirror', href: '#' },
] as const;

export default function LandingFooter(): JSX.Element {
    return (
        <footer className="relative w-full bg-neutral-950 mt-20 pt-24 pb-10 px-6 md:px-10">
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
            <h2
                className={cn(
                    'font-black tracking-tighter leading-[0.9] text-light-base',
                    'text-6xl sm:text-7xl md:text-8xl',
                    doto.className,
                )}
            >
                {APP_NAME}
            </h2>
            <p className="text-base md:text-lg text-light-base/65 leading-relaxed max-w-xl">
                Engineered to make future outcomes transparent, tradable, and verifiable.
            </p>
            <a
                href="#"
                className="group/cta mt-2 inline-flex items-center gap-x-2 font-mono text-[11px] uppercase tracking-[0.25em] text-light-base hover:text-alpha transition-colors duration-300 w-fit"
            >
                <span>Start predicting</span>
                <MdArrowOutward className="size-3.5 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
            </a>
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
    return (
        <div className="flex flex-col gap-y-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">
                {label}
            </span>
            {links.map((l) => (
                <a
                    key={l.name}
                    href={l.href}
                    className="text-[15px] text-light-base/75 hover:text-light-base transition-colors duration-200 w-fit"
                >
                    {l.name}
                </a>
            ))}
        </div>
    );
}

function BottomBar(): JSX.Element {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-y-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
            <span>
                © {APP_NAME} 2026 <span className="mx-2 text-white/20">·</span> All rights
                reserved
            </span>
            <div className="flex items-center gap-x-6">
                <a href="#" className="hover:text-light-base transition-colors duration-200">
                    Privacy
                </a>
                <a
                    href="/legal/terms"
                    className="hover:text-light-base transition-colors duration-200"
                >
                    Terms
                </a>
                <a href="#" className="hover:text-light-base transition-colors duration-200">
                    Disclosures
                </a>
            </div>
        </div>
    );
}

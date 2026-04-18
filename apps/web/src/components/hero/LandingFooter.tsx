'use client';
import { JSX, ReactNode } from 'react';
import { MdArrowOutward } from 'react-icons/md';
import { cn } from '@/lib/utils';
import { EdgeArrows } from './LandingFeatureCardsSection';

const DOT_GRID =
    'bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:9px_9px]';

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

const SOCIAL_TILES = [
    { name: 'TWITTER', handle: '@solmarket', href: '#' },
    { name: 'GITHUB', handle: '/solmarket', href: '#' },
    { name: 'DISCORD', handle: 'solmarket.gg', href: '#' },
    { name: 'MIRROR', handle: 'solmarket.xyz', href: '#' },
] as const;

export default function LandingFooter(): JSX.Element {
    return (
        <footer className="relative w-full bg-neutral-950 pt-32 pb-10 px-6 md:px-10 mt-20">
            <div className="max-w-340 mx-auto w-full">
                <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12">
                    <Block
                        className={cn(
                            'md:col-span-7 md:row-span-2 min-h-80 flex flex-col justify-between p-8',
                            DOT_GRID,
                        )}
                        index="00"
                        label="EST. 2026"
                    >
                        <div className="mt-6 font-mono text-2xl md:text-8xl tracking-wide text-alpha font-semibold">
                            SOLMARKET
                        </div>
                        <div className="mt-auto">
                            <h2 className="text-4xl md:text-5xl leading-[1.05] max-w-xl font-medium tracking-tight text-white">
                                Engineered to make future outcomes{' '}
                                <span className="text-white/35">transparent, tradable,</span> and
                                verifiable.
                            </h2>
                            <button
                                type="button"
                                className="mt-10 inline-flex items-center gap-x-4 group/cta cursor-pointer"
                            >
                                <span className="font-mono text-xs tracking-[0.2em] uppercase text-white group-hover/cta:text-alpha transition-colors duration-300">
                                    START PREDICTING
                                </span>
                                <span className="w-8 h-px bg-white/30 group-hover/cta:bg-alpha group-hover/cta:w-14 transition-all duration-300" />
                                <span className="font-mono text-white/40 group-hover/cta:text-alpha transition-colors duration-300">
                                    &rarr;
                                </span>
                            </button>
                        </div>
                    </Block>

                    <Block className="md:col-span-5 min-h-64 p-10" index="01" label="NAVIGATION">
                        <div className="mt-8 grid grid-cols-3 gap-x-6">
                            {NAV_GROUPS.map((group) => (
                                <NavGroup key={group.label} {...group} />
                            ))}
                        </div>
                    </Block>

                    <Block
                        className="md:col-span-5 min-h-56 p-10 flex flex-col"
                        index="02"
                        label="CHANNELS"
                    >
                        <div className="mt-8 grid grid-cols-2 gap-px bg-white/10 border border-white/10">
                            {SOCIAL_TILES.map((s) => (
                                <SocialTile key={s.name} {...s} />
                            ))}
                        </div>
                    </Block>
                </div>

                <BottomBar />
            </div>
        </footer>
    );
}

interface BlockProps {
    className?: string;
    children: ReactNode;
    index: string;
    label: string;
}

function Block({ className, children, index, label }: BlockProps): JSX.Element {
    return (
        <div
            className={cn(
                'relative bg-neutral-950 border border-white/10 group/block',
                'transition-colors duration-500 hover:border-white/20',
                className,
            )}
        >
            <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em] uppercase">
                <span className="text-white/40 group-hover/block:text-white/60 transition-colors duration-500">
                    INDEX / {index}
                </span>
                <span className="text-white/40 group-hover/block:text-alpha/80 transition-colors duration-500">
                    {label}
                </span>
            </div>
            {children}
            <EdgeArrows borderColor="border-white/25 group-hover/block:border-white/50 transition-colors duration-500" />
        </div>
    );
}

interface NavGroupProps {
    label: string;
    links: readonly { name: string; href: string }[];
}

function NavGroup({ label, links }: NavGroupProps): JSX.Element {
    return (
        <div className="flex flex-col gap-y-4">
            <div className="flex items-center gap-x-2">
                <span className="w-3 h-px bg-white/25" />
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
                    {label}
                </span>
            </div>
            <div className="flex flex-col gap-y-2">
                {links.map((l) => (
                    <a
                        key={l.name}
                        href={l.href}
                        className="text-[13px] text-light-base/75 hover:text-white transition-colors duration-200 flex items-center gap-x-1 group/link w-fit"
                    >
                        <span>{l.name}</span>
                        <MdArrowOutward className="opacity-0 -translate-x-1 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all duration-200 text-white/40" />
                    </a>
                ))}
            </div>
        </div>
    );
}

function SocialTile({
    name,
    handle,
    href,
}: {
    name: string;
    handle: string;
    href: string;
}): JSX.Element {
    return (
        <a
            href={href}
            className="relative bg-neutral-950 hover:bg-dark-alpha p-5 flex flex-col justify-between gap-y-6 min-h-28 transition-colors duration-300 group/tile overflow-hidden"
        >
            <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/40 group-hover/tile:text-alpha transition-colors duration-300">
                    {name}
                </span>
                <MdArrowOutward className="size-3.5 text-white/30 group-hover/tile:text-white group-hover/tile:translate-x-0.5 group-hover/tile:-translate-y-0.5 transition-all duration-300" />
            </div>
            <div className="font-mono text-[11px] tracking-wider text-white/80">{handle}</div>
        </a>
    );
}

function BottomBar(): JSX.Element {
    return (
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-y-4 font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
            <div className="flex items-center gap-x-3">
                <span className="text-white/60">© SOLMARKET 2026</span>
                <span className="w-6 h-px bg-white/15" />
                <span>ALL RIGHTS RESERVED</span>
            </div>
            <div className="flex items-center gap-x-5">
                <a href="#" className="hover:text-white transition-colors duration-200">
                    PRIVACY
                </a>
                <span className="w-3 h-px bg-white/15" />
                <a href="#" className="hover:text-white transition-colors duration-200">
                    TERMS
                </a>
                <span className="w-3 h-px bg-white/15" />
                <a href="#" className="hover:text-white transition-colors duration-200">
                    DISCLOSURES
                </a>
                <span className="hidden md:inline w-6 h-px bg-white/15" />
                <span className="hidden md:inline text-white/60">EN · USD</span>
            </div>
        </div>
    );
}

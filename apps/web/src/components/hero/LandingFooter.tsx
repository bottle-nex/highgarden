'use client';
import { JSX, useMemo, useState } from 'react';
import { MdArrowOutward } from 'react-icons/md';
import { cn } from '@/lib/utils';
import { doto } from './LandingTextContent';
import { APP_NAME } from '@/utils/constants';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useCategoryStore, type Category } from '@/store/ui/useCategoryStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type FooterLink =
    | { name: string; href: string; external?: boolean }
    | { name: string; onClick: () => void };

interface FooterGroup {
    label: string;
    links: readonly FooterLink[];
}

export default function LandingFooter(): JSX.Element {
    return (
        <footer className="relative w-full bg-white pt-40 md:pt-48 pb-10 px-6 md:px-10">
            <div className="max-w-340 mx-auto w-full">
                <BrandRow />
                <div className="my-16 h-px bg-black/10" />
                <NavGrid />
                <div className="mt-16 pt-6 border-t border-black/10">
                    <BottomBar />
                </div>
            </div>
        </footer>
    );
}

function BrandRow(): JSX.Element {
    const router = useRouter();

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
            <section className="flex items-center justify-between">
                <p className={cn('text-base md:text-3xl text-dark-base leading-relaxed max-w-xl')}>
                    Engineered to make future outcomes transparent, tradable, and verifiable.
                </p>
                <button
                    type="button"
                    onClick={() => router.push('/dashboard')}
                    aria-label="test"
                    className="relative h-44 flex-1 rounded-full text-6xl uppercase border-2 border-black overflow-hidden font-semibold cursor-pointer"
                >
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
    const router = useRouter();
    const set_active_category = useCategoryStore((s) => s.setActiveCategory);
    const require_auth = useRequireAuth();

    const groups = useMemo<readonly FooterGroup[]>(() => {
        const go_to_category = (category: Category) => () => {
            set_active_category(category);
            router.push('/dashboard');
        };

        return [
            {
                label: 'MARKETS',
                links: [
                    { name: 'Explore', onClick: go_to_category('Trending') },
                    { name: 'Politics', onClick: go_to_category('Politics') },
                    { name: 'Crypto', onClick: go_to_category('Crypto') },
                    { name: 'Sports', onClick: go_to_category('Sports') },
                ],
            },
            {
                label: 'TRADE',
                links: [
                    {
                        name: 'Portfolio',
                        onClick: () => require_auth(() => router.push('/portfolio')),
                    },
                ],
            },
            {
                label: 'LEARN',
                links: [
                    { name: 'How it Works', href: '/how-it-works' },
                    { name: 'FAQ', href: '/faq' },
                    { name: 'Resolution', href: '/docs/resolution' },
                    { name: 'Support', href: '/support' },
                    { name: 'About', href: '/about' },
                ],
            },
            {
                label: 'CONNECT',
                links: [
                    {
                        name: 'Twitter',
                        href: 'https://x.com/highgardentrade',
                        external: true,
                    },
                    {
                        name: 'GitHub',
                        href: 'https://github.com/bottle-nex/highgarden',
                        external: true,
                    },
                ],
            },
        ];
    }, [router, set_active_category, require_auth]);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 md:gap-x-10">
            {groups.map((g) => (
                <LinkColumn key={g.label} label={g.label} links={g.links} />
            ))}
        </div>
    );
}

interface LinkColumnProps {
    label: string;
    links: readonly FooterLink[];
}

function LinkColumn({ label, links }: LinkColumnProps): JSX.Element {
    const [hovered_link, set_hovered_link] = useState<string | null>(null);
    return (
        <div className="flex flex-col gap-y-3">
            <span className="text-[10px] uppercase tracking-[0.25em] text-black/90 mb-2">
                {label}
            </span>
            {links.map((l) => {
                const is_handler = 'onClick' in l;
                const href = is_handler ? '#' : l.href;
                const is_external = !is_handler && l.external === true;

                return (
                    <a
                        key={l.name}
                        href={href}
                        target={is_external ? '_blank' : undefined}
                        rel={is_external ? 'noopener noreferrer' : undefined}
                        onClick={
                            is_handler
                                ? (e) => {
                                      e.preventDefault();
                                      l.onClick();
                                  }
                                : undefined
                        }
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
                );
            })}
        </div>
    );
}

function BottomBar(): JSX.Element {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-y-3  text-[10px] uppercase tracking-[0.25em] text-dark-base">
            <span className="flex items-center gap-1">
                <span className="text-sm leading-0 pt-px">©️</span> {APP_NAME} 2026{' '}
                <span className="mx-2 text-black">·</span> All rights reserved
            </span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <a
                    href="/legal/terms"
                    className="relative text-dark-base hover:text-black transition-colors duration-200 after:absolute after:-left-1 after:-right-1 after:-bottom-1 after:h-px after:bg-alpha after:origin-center after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:ease-out"
                >
                    Terms
                </a>
                <a
                    href="/legal/privacy"
                    className="relative text-dark-base hover:text-black transition-colors duration-200 after:absolute after:-left-1 after:-right-1 after:-bottom-1 after:h-px after:bg-alpha after:origin-center after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:ease-out"
                >
                    Privacy
                </a>
            </div>
        </div>
    );
}

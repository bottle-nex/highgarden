'use client';
import { JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { PiCopySimple, PiCheck } from 'react-icons/pi';
import Applogo from '@/components/ui/Applogo';

const APP_BRAND = 'talkamore';
const APP_DOMAIN = 'talkamore.com';
const CONTACT_EMAIL = 'team@talkamore.com';

const NAV_GROUPS = [
    {
        label: 'The Product',
        links: [
            { name: 'start writing', href: '#' },
            { name: 'meet maya', href: '#' },
            { name: 'meet sage', href: '#' },
            { name: 'meet theo', href: '#' },
            { name: 'meet luna', href: '#' },
            { name: 'how memory works', href: '#' },
            { name: 'pricing', href: '#' },
            { name: 'blog', href: '#' },
        ],
    },
    {
        label: 'Honest Answers',
        links: [
            { name: 'who reads my messages', href: '#' },
            { name: 'how to delete everything', href: '#' },
            { name: 'model & infrastructure notes', href: '#' },
        ],
    },
] as const;

const SMALL_PRINT_LINKS = [
    { name: 'privacy', href: '/legal/privacy' },
    { name: 'terms', href: '/legal/terms' },
] as const;

const POST_CONTACT_LINKS = [
    { name: 'talk with the founder', href: '#' },
] as const;

export default function LandingFooter(): JSX.Element {
    return (
        <footer className="relative w-full bg-alpha pt-24 pb-10 px-6 md:px-10">
            <div className="max-w-340 mx-auto w-full">
                <NavGrid />
                <div className="mt-20 pt-6 border-t border-black/15">
                    <BottomBar />
                </div>
            </div>
        </footer>
    );
}

function NavGrid(): JSX.Element {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-12 md:gap-x-12">
            {NAV_GROUPS.map((g) => (
                <LinkColumn key={g.label} label={g.label} links={g.links} />
            ))}
            <SmallPrintColumn />
        </div>
    );
}

interface LinkColumnProps {
    label: string;
    links: readonly { name: string; href: string }[];
}

function LinkColumn({ label, links }: LinkColumnProps): JSX.Element {
    return (
        <div className="flex flex-col">
            <ColumnHeader label={label} />
            <ul className="flex flex-col gap-y-4">
                {links.map((l) => (
                    <li key={l.name}>
                        <FooterLink name={l.name} href={l.href} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function SmallPrintColumn(): JSX.Element {
    return (
        <div className="flex flex-col">
            <ColumnHeader label="The Small Print" />
            <ul className="flex flex-col gap-y-4">
                {SMALL_PRINT_LINKS.map((l) => (
                    <li key={l.name}>
                        <FooterLink name={l.name} href={l.href} />
                    </li>
                ))}
                <li>
                    <ContactEmail />
                </li>
                {POST_CONTACT_LINKS.map((l) => (
                    <li key={l.name}>
                        <FooterLink name={l.name} href={l.href} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ColumnHeader({ label }: { label: string }): JSX.Element {
    return (
        <span className="italic uppercase tracking-[0.22em] text-[11px] font-medium text-dark-base/75 mb-6">
            {label}
        </span>
    );
}

interface FooterLinkProps {
    name: string;
    href: string;
}

function FooterLink({ name, href }: FooterLinkProps): JSX.Element {
    return (
        <a
            href={href}
            className={cn(
                'relative inline-block w-fit lowercase text-[15px] font-medium text-dark-base/85',
                'transition-colors duration-200 hover:text-dark-base',
                'after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-px',
                'after:bg-dark-base after:origin-left after:scale-x-0 hover:after:scale-x-100',
                'after:transition-transform after:duration-300 after:ease-out',
            )}
        >
            {name}
        </a>
    );
}

function ContactEmail(): JSX.Element {
    const [is_copied, set_is_copied] = useState<boolean>(false);

    const handle_copy = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(CONTACT_EMAIL);
            set_is_copied(true);
            setTimeout(() => set_is_copied(false), 1600);
        } catch {
            set_is_copied(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handle_copy}
            aria-label={`Copy contact email ${CONTACT_EMAIL}`}
            className={cn(
                'group inline-flex items-center gap-x-2 rounded-md px-2.5 py-1.5 -mx-2.5',
                'border border-dark-base/30 hover:border-dark-base/70',
                'text-[15px] font-medium text-dark-base/90 hover:text-dark-base',
                'transition-colors duration-200 cursor-pointer',
            )}
        >
            <span className="lowercase">contact: {CONTACT_EMAIL}</span>
            <span className="relative inline-flex size-4 items-center justify-center">
                <AnimatePresence initial={false} mode="wait">
                    {is_copied ? (
                        <motion.span
                            key="check"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.18 }}
                            className="absolute inset-0 inline-flex items-center justify-center"
                        >
                            <PiCheck className="size-4" />
                        </motion.span>
                    ) : (
                        <motion.span
                            key="copy"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{ duration: 0.18 }}
                            className="absolute inset-0 inline-flex items-center justify-center"
                        >
                            <PiCopySimple className="size-4 opacity-70 group-hover:opacity-100" />
                        </motion.span>
                    )}
                </AnimatePresence>
            </span>
        </button>
    );
}

function BottomBar(): JSX.Element {
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-y-3 text-dark-base">
            <Wordmark />
            <span className="text-[12px] tracking-[0.08em] text-dark-base/75">
                © 2026 {APP_DOMAIN}
            </span>
        </div>
    );
}

function Wordmark(): JSX.Element {
    return (
        <div className="flex items-center gap-x-2">
            <Applogo size={18} color="#15161c" className="opacity-90" />
            <span className="text-lg font-semibold tracking-tight text-dark-base lowercase">
                {APP_BRAND}
                <span className="text-alpha">.</span>
            </span>
        </div>
    );
}

'use client';

import { JSX, MouseEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

export type TocItem = {
    id: string;
    label: string;
};

type Props = {
    items: TocItem[];
};

export default function LegalTableOfContents({ items }: Props): JSX.Element {
    const [active_id, set_active_id] = useState<string>(items[0]?.id ?? '');

    useEffect(() => {
        const elements = items
            .map(({ id }) => document.getElementById(id))
            .filter((el): el is HTMLElement => el !== null);

        if (elements.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

                if (visible[0]) {
                    set_active_id(visible[0].target.id);
                }
            },
            { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
        );

        elements.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [items]);

    const handle_click = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        set_active_id(id);
        if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `#${id}`);
        }
    };

    return (
        <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">
                On this page
            </p>
            <nav className="flex flex-col">
                {items.map(({ id, label }, idx) => {
                    const is_active = id === active_id;
                    const number = String(idx + 1).padStart(2, '0');
                    return (
                        <Link
                            key={id}
                            href={`#${id}`}
                            onClick={(event) => handle_click(event, id)}
                            className={cn(
                                'group flex items-center gap-3 py-2 text-[13px] tracking-wide transition-colors duration-300',
                                is_active
                                    ? 'text-white'
                                    : 'text-white/45 hover:text-white/80',
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'shrink-0 text-[10px] tabular-nums tracking-[0.2em] transition-colors duration-300',
                                    is_active ? 'text-alpha' : 'text-white/25',
                                )}
                            >
                                {number}
                            </span>
                            <span
                                aria-hidden
                                className={cn(
                                    'h-px shrink-0 transition-all duration-500 ease-out',
                                    is_active
                                        ? 'w-8 bg-alpha'
                                        : 'w-3 bg-white/15 group-hover:w-5 group-hover:bg-white/40',
                                )}
                            />
                            <span className="leading-snug">{label}</span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}

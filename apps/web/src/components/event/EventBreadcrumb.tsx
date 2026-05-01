'use client';

import { JSX } from 'react';
import Link from 'next/link';

export default function EventBreadcrumb({ title }: { title: string }): JSX.Element {
    return (
        <nav className="flex items-center gap-2  text-[10px] tracking-[0.25em] uppercase text-white/40">
            <Link href="/dashboard" className="hover:text-white/70">
                MARKETS
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-white/70 truncate max-w-[60ch]">{title}</span>
        </nav>
    );
}

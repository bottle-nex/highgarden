import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen w-full bg-dark-base text-white/80">
            <header className="sticky top-0 z-40 w-full bg-dark-alpha backdrop-blur-sm border-b border-white/8">
                <div className="mx-auto w-full max-w-360 h-16 px-6 lg:px-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="size-2 rounded-full bg-amber-400" />
                        <span className="text-white/85 text-[11px] tracking-[0.25em] font-semibold">
                            SOLMARKET / CURATOR
                        </span>
                    </div>
                    <nav className="flex items-center gap-4 text-[10px] tracking-[0.2em] uppercase">
                        <Link href="/admin" className="text-white/70 hover:text-white">
                            Listings
                        </Link>
                        <Link href="/dashboard" className="text-white/40 hover:text-white">
                            Exit to user view
                        </Link>
                    </nav>
                </div>
            </header>
            <main className="mx-auto w-full max-w-360 px-6 lg:px-8 py-10">{children}</main>
        </div>
    );
}

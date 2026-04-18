'use client';
import { JSX } from 'react';
import { cn } from '@/lib/utils';
import SearchBar from './SearchBar';
import { Button } from '../ui/button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import Image from 'next/image';
import Link from 'next/link';

export default function DashboardNavbar(): JSX.Element {
    const { session } = useUserSessionStore();
    return (
        <header className="sticky top-0 z-40 w-full bg-black/95 backdrop-blur-sm border-b border-white/8">
            <div className="mx-auto w-full max-w-360 h-18 px-6 lg:px-8 flex items-center gap-8">
                <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-alpha" />
                    <span className="text-white/75 font-mono text-[11px] tracking-[0.25em] font-semibold">
                        SOLMARKET
                    </span>
                    <span className="hidden md:inline-block ml-2 font-mono text-[9px] tracking-[0.25em] text-white/55 border-l border-white/12 pl-5">
                        DASHBOARD
                    </span>
                </div>

                <div className="flex-1 flex justify-center">
                    <SearchBar />
                </div>

                <div className="flex items-center gap-2">
                    <Link href={"/portfolio"}>
                        <Button
                            type="button"
                            className={cn(
                                'h-9 px-4 rounded-none bg-transparent border border-white/12 hover:bg-white/5 font-mono text-[10px] tracking-[0.2em] uppercase text-white/75',
                            )}
                        >
                            PORTFOLIO
                        </Button>
                    </Link>
                    <Button
                        type="button"
                        className={cn(
                            'h-9 px-4 rounded-none font-mono text-[10px] tracking-[0.2em] uppercase font-semibold',
                        )}
                    >
                        DEPOSIT
                    </Button>
                    <span>
                        {session?.user?.image && (
                            <Image
                                src={session?.user?.image}
                                alt="User Avatar"
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        )}
                    </span>
                </div>
            </div>
        </header>
    );
}

function LiveIndicator(): JSX.Element {
    return (
        <div className="hidden lg:flex items-center gap-2 h-9 px-4 rounded-none border border-white/10 font-mono text-[9px] tracking-[0.2em] text-white/60">
            <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full rounded-none bg-emerald-400 animate-ping opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-none bg-emerald-400" />
            </span>
            LIVE · 2,148 TRADERS
        </div>
    );
}

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
                    <span className="text-white/75  text-[11px] tracking-[0.25em] font-semibold">
                        SOLMARKET
                    </span>
                </div>

                <div className="flex-1 flex justify-center">
                    <SearchBar />
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        className={cn(
                            'h-9 px-4 rounded-[4px]! bg-transparent border border-white/12 hover:bg-white/5  text-[10px] tracking-[0.2em] uppercase text-white/75',
                        )}
                    >
                        PORTFOLIO
                    </Button>
                    <Button
                        type="button"
                        className={cn(
                            'h-9 px-4 rounded-[4px]! bg-[#ffcc00] hover:bg-[#ffcc00]  text-[10px] tracking-widest uppercase text-black/90 font-semibold',
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

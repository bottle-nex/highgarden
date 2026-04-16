'use client';
import { JSX } from 'react';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';

export default function SearchBar(): JSX.Element {
    return (
        <div className="relative w-full max-w-xl group">
            <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 group-focus-within:text-white/75 transition-colors" />
            <input
                type="text"
                placeholder="SEARCH MARKETS, EVENTS, TOPICS..."
                className="w-full h-10 bg-neutral-950 border border-white/10 rounded-md pl-10 pr-20 font-mono text-[11px] tracking-[0.15em] uppercase text-white/75 placeholder:text-white/35 outline-none focus:border-indigo-500/30 focus:ring-1 focus:ring-indigo-500/15 transition-colors"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 font-mono text-[9px] tracking-[0.2em] text-white/45">
                <kbd className="px-1.5 py-0.5 border border-white/15 rounded-none">⌘</kbd>
                <kbd className="px-1.5 py-0.5 border border-white/15 rounded-none">K</kbd>
            </span>
        </div>
    );
}

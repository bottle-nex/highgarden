'use client';
import { JSX } from 'react';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';

export default function SearchBar(): JSX.Element {
    return (
        <div className="relative w-xl group ">
            <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 group-focus-within:text-white/75 transition-colors" />
            <input
                type="text"
                placeholder="Search markets"
                className="w-full h-10 bg-dark-base pl-10 pr-20 text-[13px] text-white/75 placeholder:text-white/35 transition-colors rounded-md outline-none focus:outline-none focus:ring-0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 text-[9px] text-gray-600">
                <span className="h-5 w-8 flex justify-center items-center bg-dark-alpha/50 rounded-sm">
                    ⌘ <span className="text-[10px] pl-1">K</span>
                </span>
            </span>
        </div>
    );
}

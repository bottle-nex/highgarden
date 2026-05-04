'use client';
import { JSX, useEffect } from 'react';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';
import { useSearchPanelStore } from '@/store/ui/useSearchPanelStore';

export default function SearchBar(): JSX.Element {
    const setOpen = useSearchPanelStore((s) => s.setOpen);
    const toggle = useSearchPanelStore((s) => s.toggle);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                toggle();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggle]);

    return (
        <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative w-xl group h-10 bg-dark-base pl-10 pr-20 text-left rounded-md outline-none focus:outline-none focus:ring-0 cursor-pointer"
        >
            <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 group-hover:text-white/75 transition-colors" />
            <span className="text-[13px] text-white/35">Search markets</span>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 text-[9px] text-gray-600">
                <span className="h-5 w-8 flex justify-center items-center bg-dark-alpha/50 rounded-sm">
                    ⌘ <span className="text-[10px] pl-1">K</span>
                </span>
            </span>
        </button>
    );
}

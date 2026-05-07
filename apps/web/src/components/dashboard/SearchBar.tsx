'use client';
import { JSX, useEffect, useRef } from 'react';
import { HiMiniMagnifyingGlass } from 'react-icons/hi2';
import { AnimatePresence } from 'motion/react';
import { useSearchPanelStore } from '@/store/ui/useSearchPanelStore';
import SearchPanel from './SearchPanel';

export default function SearchBar(): JSX.Element {
    const open = useSearchPanelStore((s) => s.open);
    const setOpen = useSearchPanelStore((s) => s.setOpen);
    const query = useSearchPanelStore((s) => s.query);
    const setQuery = useSearchPanelStore((s) => s.setQuery);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (open) {
                    setOpen(false);
                    inputRef.current?.blur();
                } else {
                    inputRef.current?.focus();
                    setOpen(true);
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, setOpen]);

    return (
        <div className="relative w-xl max-w-full">
            <div className="relative h-10">
                <HiMiniMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-white/45 pointer-events-none z-10" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setOpen(true)}
                    placeholder="Search markets"
                    className="w-full h-10 bg-dark-base pl-10 pr-20 text-[13px] text-white/85 placeholder:text-white/35 outline-none focus:outline-none rounded-md"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 text-[9px] text-gray-600 pointer-events-none">
                    <span className="h-5 w-8 flex justify-center items-center bg-dark-alpha/50 rounded-sm">
                        ⌘ <span className="text-[10px] pl-1">K</span>
                    </span>
                </span>
            </div>
            <AnimatePresence>
                {open && <SearchPanel onClose={() => setOpen(false)} />}
            </AnimatePresence>
        </div>
    );
}

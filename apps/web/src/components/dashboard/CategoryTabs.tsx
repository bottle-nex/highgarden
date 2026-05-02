'use client';
import { JSX } from 'react';
import { IconType } from 'react-icons';
import {
    PiFlameFill,
    PiBellRingingFill,
    PiSparkleFill,
    PiBankFill,
    PiTrophyFill,
    PiCurrencyBtcFill,
    PiGlobeFill,
    PiFilmSlateFill,
    PiCpuFill,
    PiChartLineFill,
    PiCloudSunFill,
    PiCheckSquareOffsetFill,
    PiAtFill,
} from 'react-icons/pi';
import { cn } from '@/lib/utils';
import { CATEGORY_TABS } from '@/utils/constants';
import { useCategoryStore } from '@/store/ui/useCategoryStore';
import { AiOutlineStock } from 'react-icons/ai';

const CATEGORY_ICONS: Record<(typeof CATEGORY_TABS)[number], IconType> = {
    Trending: PiFlameFill,
    Breaking: PiBellRingingFill,
    New: PiSparkleFill,
    Politics: PiBankFill,
    Sports: PiTrophyFill,
    Crypto: PiCurrencyBtcFill,
    Geopolitics: PiGlobeFill,
    Culture: PiFilmSlateFill,
    Tech: PiCpuFill,
    Economy: PiChartLineFill,
    Weather: PiCloudSunFill,
    Elections: PiCheckSquareOffsetFill,
    Mentions: PiAtFill,
};

export default function CategoryTabs(): JSX.Element {
    const active = useCategoryStore((s) => s.activeCategory);
    const setActive = useCategoryStore((s) => s.setActiveCategory);

    return (
        <aside className="sticky top-0 self-start h-screen w-54 shrink-0 border-r border-gray-500/15 bg-dark-alpha flex flex-col">
            <div className="h-16 px-3 flex items-center shrink-0">
                <div className="flex gap-x-2 items-center">
                    <div className="h-8 w-8 rounded-sm bg-linear-to-b from-neutral-100 to-neutral-300 flex items-center justify-center ring-1 ring-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(0,0,0,0.35),0_2px_3px_rgba(0,0,0,0.5),0_4px_8px_-2px_rgba(0,0,0,0.45)] shrink-0">
                        <AiOutlineStock className="text-neutral-800 size-5" />
                    </div>

                    <div className="h-8 w-full flex flex-col -space-y-0.5">
                        <span className="text-gray-300 text-[14px] tracking-wider">Probexa</span>
                        <span className="text-[11px] text-gray-600 tracking-wide">
                            Solana markets
                        </span>
                    </div>
                </div>
            </div>
            <nav className="flex flex-col overflow-y-auto no-scrollbar flex-1 p-2">
                {CATEGORY_TABS.map((tab) => {
                    const isActive = tab === active;
                    const Icon = CATEGORY_ICONS[tab];
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActive(tab)}
                            className={cn(
                                'group relative flex items-center gap-2.5 px-3 py-2 text-[14px] tracking-wider transition-colors duration-200 whitespace-nowrap cursor-pointer text-left rounded-sm bg-linear-to-b from-[#13181d] to-[#12171c]',
                                isActive
                                    ? 'text-white/80 shadow-xs shadow-black/3 inset-shadow-xs inset-shadow-white/2'
                                    : 'text-white/50 bg-none hover:text-white/80 ',
                            )}
                        >
                            <Icon className="size-4.25 shrink-0" aria-hidden />
                            {tab}
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
}

'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { IconType } from 'react-icons';
import {
    PiFlameFill,
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
    PiBookmarkSimpleFill,
} from 'react-icons/pi';
import { cn } from '@/lib/utils';
import { CATEGORY_TABS } from '@/utils/constants';
import { useCategoryStore } from '@/store/ui/useCategoryStore';
import Applogo from '@/components/ui/Applogo';

const CATEGORY_ICONS: Record<(typeof CATEGORY_TABS)[number], IconType> = {
    Trending: PiFlameFill,
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

export default function CategorySidebar(): JSX.Element {
    const active = useCategoryStore((s) => s.activeCategory);
    const setActive = useCategoryStore((s) => s.setActiveCategory);
    const pathname = usePathname();
    const router = useRouter();

    const on_bookmarks_route = pathname?.startsWith('/bookmarks') ?? false;

    return (
        <aside className="sticky top-0 self-start h-screen w-60 shrink-0 border-r border-gray-500/15 bg-dark-alpha flex flex-col">
            <div className="h-16 px-3 flex items-center shrink-0">
                <Applogo />
            </div>
            <nav className="flex flex-col overflow-y-auto no-scrollbar flex-1 py-2 px-4">
                {CATEGORY_TABS.map((tab) => {
                    const isActive = !on_bookmarks_route && tab === active;
                    const Icon = CATEGORY_ICONS[tab];
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                setActive(tab);
                                if (on_bookmarks_route) router.push('/dashboard');
                            }}
                            className={cn(
                                'group relative flex items-center gap-2.5 px-3 py-2 text-[14px] tracking-wider transition-colors duration-200 whitespace-nowrap cursor-pointer text-left rounded-sm',
                                isActive
                                    ? ''
                                    : 'text-white/50 bg-none hover:text-white/80 ',
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'h-px shrink-0 transition-all duration-300',
                                    isActive
                                        ? 'w-8 bg-foreground'
                                        : 'w-3 bg-muted-foreground/40 group-hover:w-5 group-hover:bg-foreground',
                                )}
                            />
                            {tab}
                        </button>
                    );
                })}
                <div className="mt-2 pt-2 border-t border-white/5">
                    <Link
                        href="/bookmarks"
                        className={cn(
                            'group relative flex items-center gap-2.5 px-3 py-2 text-[14px] tracking-wider transition-colors duration-200 whitespace-nowrap cursor-pointer text-left rounded-sm no-underline',
                            on_bookmarks_route
                                ? 'text-white/80 shadow-xs shadow-black/3 inset-shadow-xs inset-shadow-white/2 bg-dark-base'
                                : 'text-white/50 bg-none hover:text-white/80 ',
                        )}
                    >
                        <PiBookmarkSimpleFill className="size-4.25 shrink-0" aria-hidden />
                        Bookmarked
                    </Link>
                </div>
            </nav>
        </aside>
    );
}

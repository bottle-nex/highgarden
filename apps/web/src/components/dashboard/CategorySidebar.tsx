'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PiBookmarkSimpleFill } from 'react-icons/pi';
import { cn } from '@/lib/utils';
import { APP_NAME, CATEGORY_TABS } from '@/utils/constants';
import { useCategoryStore } from '@/store/ui/useCategoryStore';
import Applogo from '@/components/ui/Applogo';

export default function CategorySidebar(): JSX.Element {
    const active = useCategoryStore((s) => s.activeCategory);
    const setActive = useCategoryStore((s) => s.setActiveCategory);
    const pathname = usePathname();
    const router = useRouter();

    const on_bookmarks_route = pathname?.startsWith('/bookmarks') ?? false;

    return (
        <aside className="lg:sticky lg:top-0 lg:self-start lg:h-screen w-full lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-500/15 bg-dark-alpha flex flex-col">
            <div className="hidden lg:flex h-16 px-3 items-center justify-start gap-x-2 shrink-0 text-white">
                <Link href="/" className="inline-flex items-center cursor-pointer">
                    <Applogo size={28} />
                </Link>
                <div>{APP_NAME}</div>
            </div>
            <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto no-scrollbar flex-1 py-2 px-3 sm:px-4 gap-1 lg:gap-0 items-center lg:items-stretch">
                {CATEGORY_TABS.map((tab) => {
                    const isActive = !on_bookmarks_route && tab === active;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => {
                                setActive(tab);
                                if (on_bookmarks_route) router.push('/dashboard');
                            }}
                            className={cn(
                                'group relative flex items-center gap-2.5 px-3 py-2 text-[13px] sm:text-[14px] tracking-wider transition-colors duration-200 whitespace-nowrap shrink-0 lg:shrink cursor-pointer text-left rounded-sm',
                                isActive ? '' : 'text-white/50 bg-none hover:text-white/80 ',
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
                <div className="lg:mt-2 lg:pt-2 lg:border-t lg:border-white/5 ml-1 pl-2 border-l lg:border-l-0 border-white/5 lg:ml-0 lg:pl-0 shrink-0 lg:shrink">
                    <Link
                        href="/bookmarks"
                        className={cn(
                            'group relative flex items-center gap-2.5 px-3 py-2 text-[13px] sm:text-[14px] tracking-wider transition-colors duration-200 whitespace-nowrap cursor-pointer text-left rounded-sm no-underline',
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

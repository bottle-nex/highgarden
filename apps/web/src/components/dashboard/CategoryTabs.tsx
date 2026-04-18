'use client';
import { JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import { CATEGORY_TABS } from '@/utils/constants';

export default function CategoryTabs(): JSX.Element {
    const [active, setActive] = useState<string>(CATEGORY_TABS[0]);

    return (
        <div className="w-full border-b border-white/8 bg-dark-alpha">
            <div className="mx-auto w-full max-w-360 px-6 lg:px-8">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {CATEGORY_TABS.map((tab) => {
                        const isActive = tab === active;
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActive(tab)}
                                className={cn(
                                    'group relative flex items-center px-5 py-5 text-[11px] tracking-widest uppercase transition-colors duration-200 whitespace-nowrap cursor-pointer',
                                    isActive
                                        ? 'text-white/80'
                                        : 'text-white/45 hover:text-white/70',
                                )}
                            >
                                {tab}
                                <span
                                    className={cn(
                                        'absolute left-0 right-0 bottom-0 h-px bg-[#ffcc00] origin-center transition-transform duration-300',
                                        isActive
                                            ? 'scale-x-100'
                                            : 'scale-x-0 group-hover:scale-x-100',
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

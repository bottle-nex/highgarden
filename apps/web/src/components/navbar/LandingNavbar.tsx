'use client';
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@base-ui/react';
import { cn } from '@/lib/utils';

export default function LandingNavbar() {
    const [isScrolled, setIsScrolled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.scrollY > 80;
    });

    const handleScroll = useCallback(() => {
        setIsScrolled(window.scrollY > 80);
    }, []);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    return (
        <nav
            className={cn(
                'fixed top-0 left-0 w-full z-50 flex items-center px-6 lg:px-10 transition-all duration-300',
                isScrolled ? 'h-16 bg-black' : 'h-20 bg-transparent',
            )}
        >
            <div className="flex-1 flex justify-start">
                <span className={cn('text-white text-2xl font-bold tracking-tight cursor-pointer')}>
                    Solmarket
                </span>
            </div>

            <div className="hidden md:flex gap-x-8 items-center justify-center">
                {['SOLUTIONS', 'RESOURCES', 'DOCS', 'ENTERPRISE'].map((item) => (
                    <span
                        key={item}
                        className="text-[13px] font-medium tracking-wide text-white/90 hover:text-white cursor-pointer transition-colors whitespace-nowrap"
                    >
                        {item}
                    </span>
                ))}
            </div>

            <div className="flex-1 flex items-center justify-end gap-x-6">
                <button className="text-[13px] font-medium text-white/90 hover:text-white transition-colors">
                    LOG IN
                </button>

                <div className="flex items-center gap-x-3">
                    <Button className="hidden lg:block border border-white/40 text-white px-5 py-2 rounded-full text-[13px] font-medium hover:border-white transition-all">
                        CONTACT SALES
                    </Button>

                    <Button className="bg-[#FF5100] text-white px-5 py-2 rounded-full text-[13px] font-bold hover:bg-[#e64900] transition-all">
                        GET STARTED
                    </Button>
                </div>
            </div>
        </nav>
    );
}

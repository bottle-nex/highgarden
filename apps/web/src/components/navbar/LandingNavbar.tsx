'use client';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useRouter } from 'next/navigation';


export default function LandingNavbar() {
    const router = useRouter();
    const { session } = useUserSessionStore();
    const [isScrolled, setIsScrolled] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.scrollY > 80;
    });

    const handleScroll = useCallback(() => {
        setIsScrolled(window.scrollY > 80);
    }, []);

    function handleGetStarted() {
        if (session?.user?.token && session?.user?.email) {
            router.push('/dashboard');
        } else {
            router.push('/signin');
        }
    }

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    return (
        <nav
            className={cn(
                'fixed top-0 left-0 w-full z-50 flex items-center px-6 lg:px-10 transition-all duration-300',
                isScrolled ? 'h-16 bg-black' : 'h-20 bg-black',
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
                <div className="flex items-center gap-x-3">
                    <Button onClick={handleGetStarted} className="bg-[#FF5100] text-white px-5 py-4 rounded-full text-[13px] font-bold hover:bg-[#e64900] transition-all">
                        GET STARTED
                    </Button>
                </div>
            </div>
        </nav>
    );
}

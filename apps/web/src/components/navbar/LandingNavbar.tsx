'use client';
import { useEffect, useState, useCallback, JSX } from 'react';
import { cn } from '@/lib/utils';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { APP_NAME } from '@/utils/constants';

const NAV_ITEMS = ['SOLUTIONS', 'RESOURCES', 'DOCS', 'ENTERPRISE'] as const;

export default function LandingNavbar(): JSX.Element {
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
                'fixed top-0 left-0 w-full z-50 transition-all duration-300',
                isScrolled
                    ? 'bg-neutral-950 border-b border-white/10'
                    : 'bg-transparent border-b border-transparent',
            )}
        >
            <div
                className={cn(
                    'mx-auto w-full flex items-center transition-all duration-300 px-6',
                    isScrolled ? 'h-14' : 'h-20',
                )}
            >
                <div className="flex-1 flex items-center">
                    <span className="text-white text-sm font-medium tracking-tight cursor-pointer">
                        {APP_NAME}
                    </span>
                </div>

                <div className="hidden md:flex items-center">
                    {NAV_ITEMS.map((item, i) => (
                        <a
                            key={item}
                            href="#"
                            className="group/nav relative px-5 py-2  text-[10px] tracking-[0.2em] uppercase text-white transition-colors duration-300"
                        >
                            <span className="text-white/50 mr-1.5">
                                {String(i + 1).padStart(2, '0')}
                            </span>
                            {item}
                            <span className="absolute left-5 right-5 bottom-1 h-px bg-alpha origin-left scale-x-0 group-hover/nav:scale-x-100 transition-transform duration-300" />
                        </a>
                    ))}
                </div>

                <div className="flex-1 flex items-center justify-end">
                    <GetStartedButton onClick={handleGetStarted} />
                </div>
            </div>
        </nav>
    );
}

function GetStartedButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <Button
            type="button"
            onClick={onClick}
            className="relative group/cta inline-flex items-center gap-x-3 bg-alpha rounded-none h-10 px-4 cursor-pointer transition-colors duration-300"
        >
            <span className="text-[11px] tracking-[0.2em] uppercase text-white font-semibold">
                GET STARTED
            </span>
            <span className=" text-white/80 text-xs -translate-y-px group-hover/cta:translate-x-0.5 transition-transform duration-300">
                &rarr;
            </span>
            <ButtonCorners />
        </Button>
    );
}

function ButtonCorners(): JSX.Element {
    const base = 'absolute w-2 h-2 border-white';
    return (
        <>
            <span className={cn(base, '-top-px -left-px border-t border-l')} />
            <span className={cn(base, '-top-px -right-px border-t border-r')} />
            <span className={cn(base, '-bottom-px -left-px border-b border-l')} />
            <span className={cn(base, '-bottom-px -right-px border-b border-r')} />
        </>
    );
}

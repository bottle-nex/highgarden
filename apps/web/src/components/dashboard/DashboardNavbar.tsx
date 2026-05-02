'use client';
import { JSX, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import SearchBar from './SearchBar';
import { Button } from '../ui/button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { AnimatePresence } from 'motion/react';
import OpacityBackground from '../ui/opacity-background';
import UtilityCard from '../ui/utility-card';
import DepositDialog from '../ui/deposit-dialog';

export default function DashboardNavbar(): JSX.Element {
    const { session } = useUserSessionStore();
    const [logoutOpen, setLogoutOpen] = useState<boolean>(false);
    const [openDepositDropdown, setDepositDropdown] = useState<boolean>(false);

    return (
        <header className="sticky top-0 z-40 w-full bg-dark-alpha backdrop-blur-sm border-b border-gray-500/15">
            <div className="w-full h-16 flex items-center justify-between gap-8 px-8">
                <div className="flex justify-center">
                    <SearchBar />
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        className={cn(
                            'h-9 px-4 rounded-sm text-[13px] tracking-wider bg-white text-black shadow-xs shadow-black/10 inset-shadow-2xs inset-shadow-black/10 transition-all transform duration-250',
                        )}
                    >
                        Portfolio
                    </Button>
                    <Button
                        onClick={() => setDepositDropdown((prev) => !prev)}
                        className={cn(
                            'h-9 px-4 rounded-sm text-[13px] tracking-wider bg-dark-base text-white transition-all transform duration-250',
                        )}
                    >
                        Deposit
                    </Button>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={() => setLogoutOpen(true)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setLogoutOpen(true);
                            }
                        }}
                        className="cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-full"
                    >
                        {session?.user?.image && (
                            <Image
                                src={session?.user?.image}
                                alt="User Avatar"
                                width={32}
                                height={32}
                                className="rounded-full"
                            />
                        )}
                    </span>
                </div>
            </div>

            {openDepositDropdown && <DepositDialog onClose={() => setDepositDropdown(prev => !prev)} />}
            <AnimatePresence>
                {logoutOpen && <LogoutDialog onClose={() => setLogoutOpen(false)} />}
            </AnimatePresence>
        </header>
    );
}

function LogoutDialog({ onClose }: { onClose: () => void }) {
    const [pending, startTransition] = useTransition();

    function handleLogout() {
        startTransition(async () => {
            await signOut({ callbackUrl: '/' });
        });
    }

    return (
        <OpacityBackground onBackgroundClick={onClose} escapeClosing className="bg-neutral-950">
            <UtilityCard
                onClose={onClose}
                className="w-full max-w-88 rounded-none border-white/10 px-0 py-0 backdrop-blur-md"
            >
                <EdgeTicks />

                <div className="px-7 pt-8 pb-7">
                    <div className="mb-6 flex items-center justify-between">
                        <span className=" text-[10px] tracking-[0.25em] uppercase text-white/30">
                            AUTH / 03
                        </span>
                        <span className=" text-[10px] tracking-[0.25em] uppercase text-white/30">
                            SOLMARKET
                        </span>
                    </div>

                    <h1 className="text-xl tracking-tight text-white">Sign out</h1>
                    <p className="mt-1.5  text-[10px] tracking-[0.12em] uppercase text-white/35">
                        Are you sure you want to log out?
                    </p>

                    <div className="mt-6 space-y-3">
                        <Button
                            type="button"
                            size="lg"
                            onClick={handleLogout}
                            disabled={pending}
                            className="w-full rounded-none bg-white text-black hover:bg-white/90"
                        >
                            <span className=" text-[11px] tracking-[0.2em] uppercase">
                                {pending ? 'Signing out…' : 'Logout →'}
                            </span>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={onClose}
                            disabled={pending}
                            className="w-full h-10 rounded-none border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                            <span className=" text-[11px] tracking-[0.15em] uppercase">Cancel</span>
                        </Button>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                        <span className=" text-[9px] tracking-[0.2em] uppercase text-white/25">
                            SECURED · SESSION
                        </span>
                        <span className=" text-[9px] tracking-[0.2em] uppercase text-white/25">
                            v1.0
                        </span>
                    </div>
                </div>
            </UtilityCard>
        </OpacityBackground>
    );
}

function EdgeTicks() {
    const base = 'absolute size-2 border-white/30';
    return (
        <>
            <span className={cn(base, '-top-px -left-px border-t border-l')} />
            <span className={cn(base, '-top-px -right-px border-t border-r')} />
            <span className={cn(base, '-bottom-px -left-px border-b border-l')} />
            <span className={cn(base, '-bottom-px -right-px border-b border-r')} />
        </>
    );
}

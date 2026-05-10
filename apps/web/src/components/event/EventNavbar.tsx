'use client';
import { JSX, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import SearchBar from '../dashboard/SearchBar';
import { CroppedButton } from '../ui/cropped-button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useDepositDialogStore } from '@/store/ui/useDepositDialogStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { AnimatePresence } from 'motion/react';
import OpacityBackground from '../ui/opacity-background';
import UtilityCard from '../ui/utility-card';
import DepositDialog from '../ui/deposit-dialog';
import { APP_NAME } from '@/utils/constants';
import Link from 'next/link';
import Applogo from '../ui/Applogo';

export default function EventNavbar(): JSX.Element {
    const router = useRouter();
    const { session } = useUserSessionStore();
    const setOpenSigninModal = useUserSessionStore((s) => s.setOpenSigninModal);
    const [logoutOpen, setLogoutOpen] = useState<boolean>(false);
    const openDepositDropdown = useDepositDialogStore((s) => s.open);
    const setDepositDropdown = useDepositDialogStore((s) => s.setOpen);
    const requireAuth = useRequireAuth();

    const is_signed_in = !!session?.user;

    return (
        <header className="sticky top-0 z-40 w-full bg-dark-alpha backdrop-blur-sm">
            <div className="mx-auto w-full max-w-380 px-3 sm:px-6 lg:px-8">
                <div className="h-16 flex items-center justify-between gap-3 sm:gap-4 lg:gap-8">
                    <div className="flex-1 flex items-center">
                        <Link href="/" className="inline-flex items-center gap-x-2 cursor-pointer">
                            <Applogo size={28} />
                            <div className="text-white">{APP_NAME}</div>
                        </Link>
                    </div>

                    <div className="hidden sm:block flex-1 max-w-md">
                        <SearchBar />
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <CroppedButton
                            size={'sm'}
                            onClick={() =>
                                requireAuth(() => setDepositDropdown(!openDepositDropdown))
                            }
                            className={cn(
                                'px-3 sm:px-4.5 text-[12px] font-[510] tracking-normal uppercase',
                                'bg-dark-faded text-white',
                                'transition-all duration-200',
                            )}
                        >
                            Deposit
                        </CroppedButton>
                        <CroppedButton
                            size={'sm'}
                            onClick={() => requireAuth(() => router.push('/portfolio'))}
                            className={cn(
                                'px-3 sm:px-4.5 text-[12px] font-[510] tracking-normal uppercase',
                                'bg-white text-neutral-900',
                                'transition-all duration-200',
                            )}
                        >
                            Portfolio
                        </CroppedButton>
                        {is_signed_in ? (
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
                        ) : (
                            <CroppedButton
                                onClick={() => setOpenSigninModal(true)}
                                className={cn(
                                    'px-3 sm:px-4.5 text-[12px] font-[510] tracking-normal uppercase',
                                    'bg-transparent text-white hover:bg-white/5',
                                    'transition-all duration-200',
                                )}
                            >
                                Sign in
                            </CroppedButton>
                        )}
                    </div>
                </div>
            </div>

            {openDepositDropdown && <DepositDialog onClose={() => setDepositDropdown(false)} />}
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
        <OpacityBackground onBackgroundClick={onClose} escapeClosing className="bg-white/2">
            <UtilityCard
                onClose={onClose}
                className="w-full max-w-88 rounded-none border-white/10 px-0 py-0 backdrop-blur-md bg-neutral-950"
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
                        <CroppedButton
                            type="button"
                            size="lg"
                            onClick={handleLogout}
                            disabled={pending}
                            className="w-full rounded-none bg-white text-black hover:bg-white/90"
                        >
                            <span className=" text-[11px] tracking-[0.2em] uppercase">
                                {pending ? 'Signing out…' : 'Logout →'}
                            </span>
                        </CroppedButton>
                        <CroppedButton
                            type="button"
                            size="lg"
                            onClick={onClose}
                            disabled={pending}
                            className="w-full h-10 rounded-none border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                            <span className=" text-[11px] tracking-[0.15em] uppercase">Cancel</span>
                        </CroppedButton>
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

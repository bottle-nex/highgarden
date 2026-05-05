'use client';

import { useEffect, useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { AnimatePresence, motion } from 'motion/react';
import { FcGoogle } from 'react-icons/fc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import OpacityBackground from '@/components/ui/opacity-background';
import UtilityCard from '@/components/ui/utility-card';
import { CroppedButton } from '@/components/ui/cropped-button';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { requestOtp } from '../../../app/actions/auth';

type Step = 'email' | 'code';

/**
 * Sign-in modal driven by `useUserSessionStore.openSigninModal`. Mounted once
 * at the root layout — any component can open it via
 * `useUserSessionStore.getState().setOpenSigninModal(true)` (or the
 * `useRequireAuth()` helper) without navigating away from the current page.
 *
 * The original full-page `/signin` route still works as a fallback for
 * direct links and for the OAuth callback flow.
 */
export default function SignInModal() {
    const open = useUserSessionStore((s) => s.openSigninModal);
    const setOpen = useUserSessionStore((s) => s.setOpenSigninModal);
    const session = useUserSessionStore((s) => s.session);

    // Auto-close when the user becomes authenticated (e.g. OTP verified).
    useEffect(() => {
        if (open && session?.user) setOpen(false);
    }, [open, session, setOpen]);

    return (
        <AnimatePresence>
            {open && <SignInModalInner onClose={() => setOpen(false)} />}
        </AnimatePresence>
    );
}

function SignInModalInner({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function handleGoogle() {
        setError(null);
        // Stay on the current page after OAuth completes.
        const callbackUrl = typeof window !== 'undefined' ? window.location.href : '/';
        signIn('google', { callbackUrl });
    }

    function handleRequestOtp(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
            const result = await requestOtp(email);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setStep('code');
        });
    }

    function handleVerifyOtp(value: string) {
        setError(null);
        startTransition(async () => {
            const res = await signIn('email-otp', {
                email,
                code: value,
                redirect: false,
            });
            if (!res || res.error) {
                setError('Invalid or expired code');
                setCode('');
                return;
            }
            // Modal will auto-close via the effect in SignInModal once the
            // session arrives. We don't redirect — user stays on the same page.
            onClose();
        });
    }

    return (
        <OpacityBackground onBackgroundClick={onClose} escapeClosing className="bg-neutral-900">
            <UtilityCard
                onClose={onClose}
                className="w-full max-w-88 rounded-none border-white/10 px-0 py-0 backdrop-blur-md bg-neutral-950"
            >
                <EdgeTicks />

                <div className="px-7 pt-8 pb-7">
                    <div className="mb-6 flex items-center justify-between">
                        <span className=" text-[10px] tracking-[0.25em] uppercase text-white/30">
                            {step === 'email' ? 'AUTH / 01' : 'AUTH / 02'}
                        </span>
                        <span className=" text-[10px] tracking-[0.25em] uppercase text-white/30">
                            SOLMARKET
                        </span>
                    </div>

                    <h1 className="text-xl tracking-tight text-white">
                        {step === 'email' ? 'Sign in' : 'Enter code'}
                    </h1>
                    <p className="mt-1.5  text-[10px] tracking-[0.12em] uppercase text-white/35">
                        {step === 'email' ? 'Continue with Google or email' : `Sent to ${email}`}
                    </p>

                    <div className="mt-6">
                        <AnimatePresence mode="wait">
                            {step === 'email' ? (
                                <motion.div
                                    key="email"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-4"
                                >
                                    <CroppedButton
                                        type="button"
                                        size="lg"
                                        className="w-full h-10 rounded-none border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white flex gap-x-2 items-center"
                                        onClick={handleGoogle}
                                        disabled={pending}
                                    >
                                        <FcGoogle className="size-4" />
                                        <span className=" text-[11px] tracking-[0.15em] uppercase">
                                            Continue with Google
                                        </span>
                                    </CroppedButton>

                                    <Divider />

                                    <form onSubmit={handleRequestOtp} className="space-y-3">
                                        <label className="block  text-[9px] tracking-[0.2em] uppercase text-white/40">
                                            Email
                                        </label>
                                        <Input
                                            type="email"
                                            required
                                            autoFocus
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            disabled={pending}
                                            className="h-9 rounded-none border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/25 focus-visible:border-white/40 focus-visible:ring-0"
                                        />
                                        <CroppedButton
                                            type="submit"
                                            size="lg"
                                            className="w-full bg-white text-black hover:bg-white/90"
                                            disabled={pending || !email}
                                        >
                                            <span className=" text-[11px] tracking-[0.2em] uppercase">
                                                {pending ? 'Sending…' : 'Send code →'}
                                            </span>
                                        </CroppedButton>
                                    </form>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="code"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-5"
                                >
                                    <div className="flex justify-center">
                                        <InputOTP
                                            maxLength={6}
                                            value={code}
                                            onChange={setCode}
                                            onComplete={handleVerifyOtp}
                                            disabled={pending}
                                            autoFocus
                                        >
                                            <InputOTPGroup className="gap-1.5">
                                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                                    <InputOTPSlot
                                                        key={i}
                                                        index={i}
                                                        className={cn(
                                                            'size-10 rounded-none border border-white/15 bg-white/5  text-base text-white',
                                                            'first:rounded-none last:rounded-none',
                                                            'data-[active=true]:border-white data-[active=true]:ring-0',
                                                        )}
                                                    />
                                                ))}
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setStep('email');
                                            setCode('');
                                            setError(null);
                                        }}
                                        disabled={pending}
                                        className="w-full rounded-none  text-[10px] tracking-[0.2em] uppercase text-white/40 hover:bg-transparent hover:text-white/70"
                                    >
                                        ← Use a different email
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.p
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 text-center  text-[10px] tracking-[0.15em] uppercase text-red-400/90"
                            >
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                        <span className=" text-[9px] tracking-[0.2em] uppercase text-white/25">
                            SECURED · OTP
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

function Divider() {
    return (
        <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className=" text-[9px] tracking-[0.25em] uppercase text-white/30">OR</span>
            <div className="h-px flex-1 bg-white/10" />
        </div>
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

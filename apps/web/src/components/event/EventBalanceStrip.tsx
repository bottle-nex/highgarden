'use client';
import { JSX } from 'react';
import { motion } from 'motion/react';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

function format_usd(value: number): string {
    return value.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function EventBalanceStrip(): JSX.Element {
    const session = useUserSessionStore((s) => s.session);
    const open_signin = useUserSessionStore((s) => s.setOpenSigninModal);
    const is_signed_in = !!session?.user?.token;

    // TODO: wire to real portfolio + cash sources
    const portfolio_usd = 3567.23;
    const cash_usd = 1.1;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-lg bg-dark-base lg:h-22 flex items-center"
        >
            {is_signed_in ? (
                <div className="w-full grid grid-cols-2 divide-x divide-white/8">
                    <Stat label="Portfolio" value={format_usd(portfolio_usd)} />
                    <Stat label="Cash" value={format_usd(cash_usd)} />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => open_signin(true)}
                    className="w-full px-4 py-4 flex items-center justify-center gap-2 text-[11px] font-medium tracking-[0.18em] uppercase text-white/45 hover:text-white/80 transition-colors cursor-pointer"
                >
                    <span className="size-1 rounded-full bg-white/30" />
                    Sign in to view balance
                </button>
            )}
        </motion.div>
    );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
    return (
        <div className="px-6 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-[0.22em] uppercase text-white/40">
                {label}
            </span>
            <span className="text-[16px] font-semibold tabular-nums text-white/90">{value}</span>
        </div>
    );
}

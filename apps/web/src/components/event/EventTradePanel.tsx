'use client';

import { JSX, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { selectDepth, useOrderBookDepthStore } from '@/store/book/useOrderBookDepthStore';

interface Props {
    market: MarketDTO;
    selectedOutcome: Outcome;
    onOutcomeChange: (o: Outcome) => void;
}

const QUICK_AMOUNTS = [1, 5, 10, 100] as const;
const FEE_RATE = 0.02;

function format_cents(price: number | undefined): string {
    if (price === undefined || !Number.isFinite(price)) return '—';
    return `${(price * 100).toFixed(1)}¢`;
}

export default function EventTradePanel({
    market,
    selectedOutcome,
    onOutcomeChange,
}: Props): JSX.Element {
    const [tab, set_tab] = useState<'BUY' | 'SELL'>('BUY');
    const [amount, set_amount] = useState('');

    const yes_depth = useOrderBookDepthStore(selectDepth(market.id, Outcome.YES));
    const no_depth = useOrderBookDepthStore(selectDepth(market.id, Outcome.NO));
    const yes_price = yes_depth?.asks[0]?.price;
    const no_price = no_depth?.asks[0]?.price;
    const active_price = selectedOutcome === Outcome.YES ? yes_price : no_price;

    const flash_ref = useRef<HTMLDivElement>(null);
    const last_active_price = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (active_price === undefined) return;
        const prev = last_active_price.current;
        last_active_price.current = active_price;
        if (prev === undefined || prev === active_price) return;
        const el = flash_ref.current;
        if (!el) return;
        const cls = active_price > prev ? 'flash-up' : 'flash-down';
        el.classList.add(cls);
        const timer = setTimeout(() => el.classList.remove(cls), 350);
        return () => clearTimeout(timer);
    }, [active_price]);

    const usd = parseFloat(amount) || 0;
    const safe_price =
        active_price !== undefined && active_price > 0 && active_price < 1 ? active_price : 0.5;
    const shares = usd > 0 ? usd / safe_price : 0;
    const est_payout = shares;
    const fee = usd * FEE_RATE;

    const handle_submit = () => {
        if (usd <= 0) {
            toast.error('Enter an amount first');
            return;
        }
        if (tab === 'SELL') {
            toast.info('Sell flow coming soon');
            return;
        }
        toast.info('Trade signing coming soon — wallet adapter is wired in the next pass.');
    };

    return (
        <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="border border-white/10 rounded-[6px] bg-neutral-950/60 lg:sticky lg:top-24"
        >
            <div className="flex items-center justify-between px-5 pt-5">
                <div className="flex gap-4  text-[11px] tracking-[0.22em] uppercase">
                    {(['BUY', 'SELL'] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => set_tab(t)}
                            className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                                tab === t
                                    ? 'border-white text-white'
                                    : 'border-transparent text-white/40 hover:text-white/65'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <span className=" text-[9px] tracking-[0.25em] uppercase text-white/30">
                    MARKET
                </span>
            </div>

            <div className="px-5 pt-5 pb-6 space-y-5">
                <div ref={flash_ref} className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => onOutcomeChange(Outcome.YES)}
                        className={`flex items-center justify-between px-4 py-3 rounded-md border transition-colors cursor-pointer ${
                            selectedOutcome === Outcome.YES
                                ? 'bg-emerald-500/12 border-emerald-500/40'
                                : 'bg-emerald-500/5 border-emerald-500/15 hover:border-emerald-500/30'
                        }`}
                    >
                        <span className=" text-[10px] tracking-[0.22em] uppercase text-emerald-300/90">
                            YES
                        </span>
                        <span className=" text-[13px] tabular-nums text-emerald-300">
                            {format_cents(yes_price)}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onOutcomeChange(Outcome.NO)}
                        className={`flex items-center justify-between px-4 py-3 rounded-md border transition-colors cursor-pointer ${
                            selectedOutcome === Outcome.NO
                                ? 'bg-rose-500/12 border-rose-500/40'
                                : 'bg-rose-500/5 border-rose-500/15 hover:border-rose-500/30'
                        }`}
                    >
                        <span className=" text-[10px] tracking-[0.22em] uppercase text-rose-300/90">
                            NO
                        </span>
                        <span className=" text-[13px] tabular-nums text-rose-300">
                            {format_cents(no_price)}
                        </span>
                    </button>
                </div>

                <div>
                    <div className=" text-[9px] tracking-[0.25em] uppercase text-white/40 mb-2">
                        AMOUNT
                    </div>
                    <div className="flex items-center justify-between border border-white/10 rounded-md px-4 py-3 bg-white/[0.02]">
                        <span className=" text-[12px] tracking-[0.18em] uppercase text-white/40">
                            $
                        </span>
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            placeholder="0"
                            value={amount}
                            onChange={(e) => set_amount(e.target.value)}
                            className="flex-1 bg-transparent outline-none text-right text-2xl tabular-nums text-white/90 placeholder:text-white/15"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    {QUICK_AMOUNTS.map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => set_amount(String((parseFloat(amount) || 0) + v))}
                            className="py-2 rounded-md border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05]  text-[11px] tabular-nums text-white/65 cursor-pointer"
                        >
                            +${v}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={handle_submit}
                    className="w-full py-3.5 rounded-md bg-indigo-500/90 hover:bg-indigo-500 transition-colors text-[13px] font-medium text-white tracking-wide cursor-pointer disabled:opacity-50"
                >
                    Trade
                </button>

                <dl className="grid grid-cols-1 gap-1.5  text-[11px] tabular-nums">
                    <Row label="Avg price" value={format_cents(active_price)} />
                    <Row label="Est. shares" value={shares > 0 ? shares.toFixed(2) : '0.00'} />
                    <Row label="Est. payout" value={`$${est_payout.toFixed(2)}`} accent="emerald" />
                    <Row label="Fee (2%)" value={`$${fee.toFixed(2)}`} />
                    <Row label="Tick" value={market.tickSize} muted />
                </dl>

                <p className="text-[10px] text-white/35 text-center pt-1">
                    By trading, you agree to the{' '}
                    <span className="underline underline-offset-2">Terms of Use</span>.
                </p>
            </div>
        </motion.aside>
    );
}

function Row({
    label,
    value,
    accent,
    muted,
}: {
    label: string;
    value: string;
    accent?: 'emerald';
    muted?: boolean;
}) {
    return (
        <div className="flex items-center justify-between">
            <dt className="text-white/40">{label}</dt>
            <dd
                className={
                    accent === 'emerald'
                        ? 'text-emerald-300/90'
                        : muted
                          ? 'text-white/35'
                          : 'text-white/80'
                }
            >
                {value}
            </dd>
        </div>
    );
}

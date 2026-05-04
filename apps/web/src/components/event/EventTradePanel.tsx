'use client';
import { JSX, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { selectDepth, useOrderBookDepthStore } from '@/store/book/useOrderBookDepthStore';
import { cn } from '@/lib/utils';

interface Props {
    market: MarketDTO;
}

const QUICK_AMOUNTS = [1, 5, 10, 100] as const;

function format_cents(price: number | undefined): string {
    if (price === undefined || !Number.isFinite(price)) return '—';
    return `${(price * 100).toFixed(1)}¢`;
}

export default function EventTradePanel({ market }: Props): JSX.Element {
    const [selectedOutcome, setSelectedOutcome] = useState<Outcome>(Outcome.YES);
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
            className="rounded-lg bg-dark-base p-1"
        >
            <div className="flex items-center justify-between px-5 pt-4">
                <div className="flex gap-1">
                    {(['BUY', 'SELL'] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => set_tab(t)}
                            className={`relative px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
                                tab === t ? 'text-white' : 'text-white/45 hover:text-white/75'
                            }`}
                        >
                            {tab === t && (
                                <motion.span
                                    layoutId="trade-tab-pill"
                                    className="absolute inset-0 rounded-full bg-dark-faded"
                                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                                />
                            )}
                            <span className="relative z-10">{t === 'BUY' ? 'Buy' : 'Sell'}</span>
                        </button>
                    ))}
                </div>
                <span className="text-[10px] font-medium tracking-[0.18em] uppercase text-white/35">
                    Market
                </span>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-3.5">
                <div ref={flash_ref} className="grid grid-cols-2 gap-2.5">
                    <button
                        aria-label="yes"
                        type="button"
                        data-pressed={selectedOutcome === Outcome.YES ? 'true' : 'false'}
                        onClick={() => setSelectedOutcome(Outcome.YES)}
                        className="green-btn flex items-center justify-between px-4 py-3 rounded-lg"
                    >
                        <span className="text-[12px] font-semibold tracking-[0.16em] uppercase">
                            Yes
                        </span>
                        <span className="text-[15px] font-bold tabular-nums text-emerald-300">
                            {format_cents(yes_price)}
                        </span>
                    </button>
                    <button
                        aria-label="no"
                        type="button"
                        data-pressed={selectedOutcome === Outcome.NO ? 'true' : 'false'}
                        onClick={() => setSelectedOutcome(Outcome.NO)}
                        className="red-btn flex items-center justify-between px-4 py-3 rounded-lg"
                    >
                        <span className="text-[12px] font-semibold tracking-[0.16em] uppercase">
                            No
                        </span>
                        <span className="text-[15px] font-bold tabular-nums text-rose-300">
                            {format_cents(no_price)}
                        </span>
                    </button>
                </div>

                <div className="rounded-lg bg-white/2.5 px-4 py-3.5">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] font-medium text-white/55">Amount</span>
                        <span className="text-[11px] font-medium text-white/35 tabular-nums">
                            ≈ {shares > 0 ? shares.toFixed(2) : '0.00'} shares
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span
                            className={`text-3xl font-bold leading-none transition-colors ${
                                amount ? 'text-white' : 'text-white/40'
                            }`}
                        >
                            $
                        </span>
                        <div className="relative flex-1 min-w-0 h-10">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                placeholder="0"
                                value={amount}
                                onChange={(e) => set_amount(e.target.value)}
                                className="absolute inset-0 w-full bg-transparent outline-none text-3xl font-bold tabular-nums text-transparent caret-transparent placeholder:text-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div
                                className={`absolute inset-0 flex items-center pointer-events-none text-3xl font-bold tabular-nums ${
                                    amount ? 'text-white' : 'text-white/20'
                                }`}
                            >
                                {(amount || '0').split('').map((char, idx) => (
                                    <span
                                        key={idx}
                                        className="relative inline-flex justify-center overflow-hidden"
                                        style={{ width: char === '.' ? '0.35em' : '0.6em' }}
                                    >
                                        <AnimatePresence mode="popLayout" initial={false}>
                                            <motion.span
                                                key={char}
                                                initial={{ y: '70%', opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                exit={{ y: '-70%', opacity: 0 }}
                                                transition={{
                                                    type: 'spring',
                                                    stiffness: 500,
                                                    damping: 38,
                                                }}
                                                className="inline-block"
                                            >
                                                {char}
                                            </motion.span>
                                        </AnimatePresence>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[12px] font-medium text-white/55 shrink-0 w-20"></span>
                    <div className="grid grid-cols-4 gap-2 flex-1">
                        {QUICK_AMOUNTS.map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => set_amount(String((parseFloat(amount) || 0) + v))}
                                className="py-1.5 rounded-md bg-white/5 hover:bg-white/6 text-[12px] font-semibold tabular-nums text-white/50 hover:text-white/80 transition-colors duration-250 cursor-pointer"
                            >
                                +${v}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handle_submit}
                    className={cn(
                        'w-full py-3 bg-neutral-300 rounded-lg text-black active:translate-y-px text-[14px] font-bold cursor-pointer transition-all transform duration-200 active:scale-[0.99]',
                        'shadow-[inset_0_-2.5px_0_rgba(255,255,255,1)]',
                    )}
                >
                    Deposit
                </button>

                <p className="text-[10px] text-white/35 text-center">
                    By trading, you agree to the{' '}
                    <span className="underline underline-offset-2">Terms of Use</span>.
                </p>
            </div>
        </motion.aside>
    );
}

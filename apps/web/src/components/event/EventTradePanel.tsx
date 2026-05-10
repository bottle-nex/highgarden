'use client';

import { JSX, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import { Outcome, Side } from '@solmarket/types';
import { selectDepth, useOrderBookDepthStore } from '@/store/book/useOrderBookDepthStore';
import { selectShares, usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { cn } from '@/lib/utils';
import trading_api, { TradingError } from '@/lib/api/trading';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePortfolioSync } from '@/hooks/usePortfolioSync';
import Link from 'next/link';
import Image from 'next/image';

interface Props {
    market: MarketDTO;
}

type InputMode = 'USDC' | 'SHARES';

const QUICK_AMOUNTS_USDC = [1, 5, 10, 100] as const;
const QUICK_AMOUNTS_SHARES = [1, 5, 10, 50] as const;

/**
 * Feature flag for the hedge-first trade flow (PR 2/5 server endpoint).
 * Resolved once at module load: `NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE === "true"`.
 *
 * When `true`, the panel calls the new `POST /markets/:id/trade` endpoint
 * (Polymarket fill → Solana commit, single round-trip).
 * When `false` (default), falls back to the legacy `request_quote` +
 * `place_order` two-call sequence.
 *
 * Flip via env without a redeploy of new client code; both paths coexist
 * during migration and will be merged once the new flow soaks in prod.
 */
const USE_HEDGE_FIRST_TRADE: boolean = process.env.NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE === 'true';

function format_cents(price: number | undefined): string {
    if (price === undefined || !Number.isFinite(price)) return '—';
    return `${(price * 100).toFixed(1)}¢`;
}

export default function EventTradePanel({ market }: Props): JSX.Element {
    usePortfolioSync();
    const [selectedOutcome, setSelectedOutcome] = useState<Outcome>(Outcome.YES);
    const [tab, set_tab] = useState<'BUY' | 'SELL'>('BUY');
    const [amount, set_amount] = useState<string>('');
    const [input_mode, set_input_mode] = useState<InputMode>('USDC');
    const [submitting, set_submitting] = useState<boolean>(false);
    const [focused, set_focused] = useState<boolean>(false);
    const [img_error, set_img_error] = useState<boolean>(false);
    const [claiming, set_claiming] = useState<boolean>(false);
    const requireAuth = useRequireAuth();

    const is_resolved = market.status === 'RESOLVED';

    const yes_depth = useOrderBookDepthStore(selectDepth(market.id, Outcome.YES));
    const no_depth = useOrderBookDepthStore(selectDepth(market.id, Outcome.NO));
    const yes_price = tab === 'BUY' ? yes_depth?.asks[0]?.price : yes_depth?.bids[0]?.price;
    const no_price = tab === 'BUY' ? no_depth?.asks[0]?.price : no_depth?.bids[0]?.price;
    const active_price = selectedOutcome === Outcome.YES ? yes_price : no_price;

    const owned_shares = usePositionsStore(selectShares(market.id, selectedOutcome));
    const apply_fill = usePositionsStore((s) => s.applyFill);

    const max_amount_for_mode = (mode: InputMode, price: number): number => {
        if (mode === 'SHARES') return owned_shares;
        return +(owned_shares * price).toFixed(2);
    };

    const clamp_for_sell = (raw: string, mode: InputMode, price: number): string => {
        if (tab !== 'SELL') return raw;
        if (raw === '') return raw;
        const max = max_amount_for_mode(mode, price);
        if (max <= 0) return '0';
        const n = parseFloat(raw);
        if (!Number.isFinite(n) || n < 0) return raw;
        if (n <= max) return raw;
        return mode === 'SHARES' ? String(max) : max.toFixed(2);
    };

    const flash_ref = useRef<HTMLDivElement>(null);
    const last_active_price = useRef<number | undefined>(undefined);
    const last_outcome = useRef<Outcome>(selectedOutcome);

    useEffect(() => {
        if (active_price === undefined) return;
        const prev = last_active_price.current;
        const prev_outcome = last_outcome.current;
        last_active_price.current = active_price;
        last_outcome.current = selectedOutcome;
        // Skip flash when the user toggled YES/NO — the price change is just
        // because we're reading a different side of the book, not a live tick.
        if (prev_outcome !== selectedOutcome) return;
        if (prev === undefined || prev === active_price) return;
        const el = flash_ref.current;
        if (!el) return;
        const cls = active_price > prev ? 'flash-up' : 'flash-down';
        el.classList.add(cls);
        const timer = setTimeout(() => el.classList.remove(cls), 350);
        return () => clearTimeout(timer);
    }, [active_price, selectedOutcome]);

    const safe_price =
        active_price !== undefined && active_price > 0 && active_price < 1 ? active_price : 0.5;

    const computed = useMemo(() => {
        const raw = parseFloat(amount);
        if (!Number.isFinite(raw) || raw <= 0) {
            return { shares: 0, usd: 0 };
        }
        if (input_mode === 'USDC') {
            const target_shares = Math.floor(raw / safe_price);
            return { shares: target_shares, usd: target_shares * safe_price };
        }
        const target_shares = Math.floor(raw);
        return { shares: target_shares, usd: target_shares * safe_price };
    }, [amount, input_mode, safe_price]);

    // Trades clear two constraints at once: shares are integer-only on-chain,
    // and Polymarket rejects hedges below $1 notional. The real minimum input
    // is therefore ceil(1 / price) whole shares — which at high prices means
    // the user has to spend well over $1 (e.g. 2 × 97¢ = $1.94).
    const min_shares = Math.max(1, Math.ceil(1 / safe_price));
    const min_usd = +(min_shares * safe_price).toFixed(2);

    const disable_reason = useMemo<string | null>(() => {
        if (!market.solanaMarketPda) return 'Trading not yet available on this market';
        if (active_price === undefined) return 'Loading price…';

        const share_word = (n: number) => `${n} share${n === 1 ? '' : 's'}`;
        const below_min = computed.shares < min_shares || computed.usd < 1;

        if (tab === 'SELL') {
            if (owned_shares <= 0) {
                return `You don't own any ${selectedOutcome} shares to sell`;
            }
            if (below_min) {
                return input_mode === 'USDC'
                    ? `Minimum $${min_usd.toFixed(2)} to sell (${share_word(min_shares)})`
                    : `Minimum ${share_word(min_shares)} to sell (≈ $${min_usd.toFixed(2)})`;
            }
            if (computed.shares > owned_shares) {
                return `You only own ${owned_shares.toLocaleString()} ${selectedOutcome} shares`;
            }
            return null;
        }

        if (below_min) {
            return input_mode === 'USDC'
                ? `Minimum $${min_usd.toFixed(2)} to trade (${share_word(min_shares)} at ${(safe_price * 100).toFixed(0)}¢)`
                : `Minimum ${share_word(min_shares)} (≈ $${min_usd.toFixed(2)} at ${(safe_price * 100).toFixed(0)}¢)`;
        }
        return null;
    }, [
        market.solanaMarketPda,
        active_price,
        computed.shares,
        computed.usd,
        safe_price,
        min_shares,
        min_usd,
        input_mode,
        tab,
        owned_shares,
        selectedOutcome,
    ]);

    const handle_submit = async () => {
        if (submitting) return;
        // Auth gate: if the user isn't signed in, open the modal instead of
        // attempting the trade. Trading endpoints require auth server-side
        // anyway — this is purely a better UX than a 401 toast.
        if (!requireAuth()) return;
        if (disable_reason) {
            toast.error(disable_reason);
            return;
        }
        set_submitting(true);
        try {
            if (USE_HEDGE_FIRST_TRADE) {
                await submit_hedge_first();
            } else {
                await submit_legacy_two_call();
            }
            set_amount('');
        } catch (err: unknown) {
            const msg =
                err instanceof TradingError
                    ? err.user_message
                    : 'Something went wrong. Please try again.';
            toast.error(msg);
        } finally {
            set_submitting(false);
        }
    };

    /**
     * PR 3 hedge-first path. Single round-trip; server places Polymarket
     * leg AND Solana leg before returning. Uses the actual Polymarket fill
     * price for the on-chain commit, so the spread is locked in (vs. the
     * legacy two-call flow where Polymarket can move between quote and
     * fill).
     */
    const submit_hedge_first = async () => {
        const result = await trading_api.trade(market.id, {
            side: tab,
            outcome: selectedOutcome === Outcome.YES ? 'YES' : 'NO',
            size: computed.shares,
        });
        apply_fill({
            marketId: market.id,
            side: tab === 'BUY' ? Side.BUY : Side.SELL,
            outcome: selectedOutcome,
            price: result.pricePaidCents,
            size: result.filledShares,
        });
        const verb = tab === 'BUY' ? 'Bought' : 'Sold';
        const outcome_label = selectedOutcome === Outcome.YES ? 'YES' : 'NO';
        const short_tx = `${result.txSignature.slice(0, 8)}…${result.txSignature.slice(-6)}`;
        const description = result.nettedFromInventory
            ? `Tx ${short_tx} · netted from platform inventory`
            : `Tx ${short_tx}`;
        toast.success(
            `${verb} ${result.filledShares} ${outcome_label} for $${result.totalUsd.toFixed(2)}`,
            { description },
        );
    };

    /**
     * Pre-PR-2 legacy flow. Kept during migration so flipping the feature
     * flag back falls cleanly onto the original two-call path. Will be
     * removed in PR 5 once the new flow has soaked in production.
     */
    const submit_legacy_two_call = async () => {
        const signed = await trading_api.request_quote(market.id, {
            side: tab,
            outcome: selectedOutcome === Outcome.YES ? 'YES' : 'NO',
            size: computed.shares,
        });
        const result = await trading_api.place_order(market.id, signed);
        apply_fill({
            marketId: market.id,
            side: tab === 'BUY' ? Side.BUY : Side.SELL,
            outcome: selectedOutcome,
            price: signed.price,
            size: computed.shares,
        });
        const verb = tab === 'BUY' ? 'Bought' : 'Sold';
        const outcome_label = selectedOutcome === Outcome.YES ? 'YES' : 'NO';
        toast.success(
            `${verb} ${computed.shares} ${outcome_label} for $${computed.usd.toFixed(2)}`,
            {
                description: `Tx ${result.txSignature.slice(0, 8)}…${result.txSignature.slice(-6)}`,
            },
        );
    };

    const toggle_mode = () => set_input_mode((m) => (m === 'USDC' ? 'SHARES' : 'USDC'));
    const button_label = build_button_label({
        tab,
        submitting,
        disable_reason,
        computed,
        input_mode,
    });
    const quick_amounts = input_mode === 'USDC' ? QUICK_AMOUNTS_USDC : QUICK_AMOUNTS_SHARES;

    const handle_claim = async () => {
        if (claiming) return;
        set_claiming(true);
        try {
            const result = await trading_api.claim(market.id);
            const short = `${result.txSignature.slice(0, 8)}…${result.txSignature.slice(-6)}`;
            toast.success('Claim submitted', { description: `Tx ${short}` });
        } catch (err: unknown) {
            const msg =
                err instanceof TradingError
                    ? err.user_message
                    : 'Something went wrong. Please try again.';
            toast.error(msg);
        } finally {
            set_claiming(false);
        }
    };

    const show_image = !!market.imageUrl && !img_error;

    return (
        <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-lg bg-dark-base p-1"
        >
            {is_resolved && (
                <div className="px-5 py-6 space-y-4">
                    <div>
                        <div className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                            Resolved
                        </div>
                        <div className="text-[13px] text-white/85 mt-1">
                            This market has been resolved.
                        </div>
                        <p className="text-[11px] text-white/45 mt-2">
                            If you held winning shares, you can claim your USDC payout now.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handle_claim}
                        disabled={claiming}
                        className={cn(
                            'w-full py-3 rounded-lg text-[14px] font-bold transition-all transform duration-200',
                            'bg-emerald-400 text-emerald-950 active:translate-y-px',
                            'shadow-[inset_0_-2.5px_0_rgba(0,0,0,0.18)]',
                            claiming
                                ? 'opacity-40 cursor-not-allowed'
                                : 'cursor-pointer active:scale-[0.99]',
                        )}
                    >
                        {claiming ? 'Claiming…' : 'Claim payout'}
                    </button>
                </div>
            )}

            {!is_resolved && (
                <>
                    <div className="flex items-center justify-between px-3 sm:px-5 pt-3 sm:pt-4">
                        <div className="flex gap-1">
                            {(['BUY', 'SELL'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => set_tab(t)}
                                    className={`relative px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
                                        tab === t
                                            ? 'text-white'
                                            : 'text-white/45 hover:text-white/75'
                                    }`}
                                >
                                    {tab === t && (
                                        <motion.span
                                            layoutId="trade-tab-pill"
                                            className="absolute inset-0 rounded-full bg-dark-faded"
                                            transition={{
                                                type: 'spring',
                                                stiffness: 400,
                                                damping: 32,
                                            }}
                                        />
                                    )}
                                    <span className="relative z-10">
                                        {t === 'BUY' ? 'Buy' : 'Sell'}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {show_image && (
                            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-lg overflow-hidden shrink-0">
                                <Image
                                    src={market.imageUrl!}
                                    alt=""
                                    className="w-full h-full object-cover rounded-lg border-2 border-white"
                                    onError={() => set_img_error(true)}
                                    width={52}
                                    height={52}
                                />
                            </div>
                        )}
                    </div>

                    <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-4 sm:pb-5 space-y-3 sm:space-y-3.5">
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
                                <button
                                    type="button"
                                    onClick={toggle_mode}
                                    className="text-[12px] font-medium text-white/55 hover:text-white/85 cursor-pointer transition-colors"
                                    title="Switch input units"
                                >
                                    Amount ({input_mode === 'USDC' ? 'USDC' : 'Shares'})
                                </button>
                                <span className="text-[11px] font-medium text-white/35 tabular-nums">
                                    {input_mode === 'USDC'
                                        ? `≈ ${computed.shares} shares`
                                        : `≈ $${computed.usd.toFixed(2)}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span
                                    className={`text-2xl sm:text-3xl font-bold leading-none transition-colors ${
                                        amount ? 'text-white' : 'text-white/40'
                                    }`}
                                >
                                    {input_mode === 'USDC' ? '$' : '#'}
                                </span>
                                <div className="relative flex-1 min-w-0 h-10">
                                    <input
                                        type="number"
                                        inputMode={input_mode === 'USDC' ? 'decimal' : 'numeric'}
                                        min={0}
                                        step={input_mode === 'USDC' ? '0.01' : '1'}
                                        placeholder="0"
                                        value={amount}
                                        onChange={(e) =>
                                            set_amount(
                                                clamp_for_sell(
                                                    e.target.value,
                                                    input_mode,
                                                    safe_price,
                                                ),
                                            )
                                        }
                                        onFocus={() => set_focused(true)}
                                        onBlur={() => set_focused(false)}
                                        className="absolute inset-0 w-full bg-transparent outline-none text-2xl sm:text-3xl font-bold tabular-nums text-transparent caret-transparent placeholder:text-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div
                                        className={`absolute inset-0 flex items-center pointer-events-none text-2xl sm:text-3xl font-bold tabular-nums ${
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
                                        {focused && (
                                            <motion.span
                                                aria-hidden
                                                animate={{ opacity: [1, 1, 0, 0] }}
                                                transition={{
                                                    duration: 1,
                                                    repeat: Infinity,
                                                    ease: 'linear',
                                                    times: [0, 0.5, 0.5, 1],
                                                }}
                                                className="ml-0.5 inline-block w-0.5 h-7 bg-white"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-[12px] font-medium text-white/55 shrink-0 w-20"></span>
                            <div className="grid grid-cols-4 gap-2 flex-1">
                                {quick_amounts.map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() =>
                                            set_amount(
                                                clamp_for_sell(
                                                    String((parseFloat(amount) || 0) + v),
                                                    input_mode,
                                                    safe_price,
                                                ),
                                            )
                                        }
                                        className="py-1.5 rounded-md bg-white/5 hover:bg-white/6 text-[12px] font-semibold tabular-nums text-white/50 hover:text-white/80 transition-colors duration-250 cursor-pointer"
                                    >
                                        {input_mode === 'USDC' ? `+$${v}` : `+${v}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {tab === 'SELL' && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/55">
                                    You own{' '}
                                    <span className="text-white font-semibold tabular-nums">
                                        {owned_shares.toLocaleString()}
                                    </span>{' '}
                                    {selectedOutcome === Outcome.YES ? 'YES' : 'NO'} share
                                    {owned_shares === 1 ? '' : 's'}
                                </span>
                                <button
                                    type="button"
                                    disabled={owned_shares <= 0}
                                    onClick={() => {
                                        if (owned_shares <= 0) return;
                                        if (input_mode === 'SHARES') {
                                            set_amount(String(owned_shares));
                                        } else {
                                            set_amount((owned_shares * safe_price).toFixed(2));
                                        }
                                    }}
                                    className={cn(
                                        'px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors',
                                        owned_shares > 0
                                            ? 'bg-white/8 hover:bg-white/15 text-white/80 cursor-pointer'
                                            : 'bg-white/5 text-white/25 cursor-not-allowed',
                                    )}
                                >
                                    Max
                                </button>
                            </div>
                        )}

                        {disable_reason && (
                            <p className="text-[11px] text-white/45 text-center -mt-1">
                                {disable_reason}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={handle_submit}
                            disabled={!!disable_reason || submitting}
                            className={cn(
                                'w-full py-3 bg-neutral-300 rounded-lg text-black active:translate-y-px text-[14px] font-bold transition-all transform duration-200',
                                'shadow-[inset_0_-2.5px_0_rgba(255,255,255,1)]',
                                disable_reason || submitting
                                    ? 'opacity-40 cursor-not-allowed'
                                    : 'cursor-pointer active:scale-[0.99]',
                            )}
                        >
                            {button_label}
                        </button>

                        <p className="text-[10px] text-white/35 text-center">
                            By trading, you agree to the{' '}
                            <Link href={'/legal/terms'}>
                                <span className="underline underline-offset-2 text-blue-500 cursor-pointer">
                                    Terms of Use
                                </span>
                                .
                            </Link>
                        </p>
                    </div>
                </>
            )}
        </motion.aside>
    );
}

interface ButtonLabelArgs {
    tab: 'BUY' | 'SELL';
    submitting: boolean;
    disable_reason: string | null;
    computed: { shares: number; usd: number };
    input_mode: InputMode;
}

function build_button_label({
    tab,
    submitting,
    disable_reason,
    computed,
    input_mode,
}: ButtonLabelArgs): string {
    if (submitting) return tab === 'BUY' ? 'Buying…' : 'Selling…';
    if (disable_reason) return tab === 'BUY' ? 'Buy' : 'Sell';
    if (input_mode === 'USDC') {
        return `${tab === 'BUY' ? 'Buy' : 'Sell'} ${computed.shares} for $${computed.usd.toFixed(2)}`;
    }
    return `${tab === 'BUY' ? 'Buy' : 'Sell'} ${computed.shares} · $${computed.usd.toFixed(2)}`;
}

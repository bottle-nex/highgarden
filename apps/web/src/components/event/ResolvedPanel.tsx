'use client';
import { JSX, useState } from 'react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import { cn } from '@/lib/utils';
import trading_api, { TradingError } from '@/lib/api/trading';

interface Props {
    market: MarketDTO;
}

export default function ResolvedPanel({ market }: Props): JSX.Element {
    const [claiming, set_claiming] = useState<boolean>(false);
    const winner_label =
        market.winningOutcome === 'YES' ? 'YES' : market.winningOutcome === 'NO' ? 'NO' : null;

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

    return (
        <div className="px-5 py-6 space-y-4">
            <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                    Resolved
                </div>
                {winner_label ? (
                    <div className="text-[13px] text-white/85 mt-1">
                        <span
                            className={cn(
                                'font-semibold',
                                winner_label === 'YES' ? 'text-emerald-300' : 'text-rose-300',
                            )}
                        >
                            {winner_label}
                        </span>{' '}
                        won — market settled.
                    </div>
                ) : (
                    <div className="text-[13px] text-white/85 mt-1">
                        This market has been resolved.
                    </div>
                )}
                <p className="text-[11px] text-white/45 mt-2">
                    {market.claimable
                        ? 'If you held winning shares, you can claim your USDC payout now.'
                        : 'On-chain settlement in flight — Claim will enable in a moment.'}
                </p>
            </div>
            <button
                type="button"
                onClick={handle_claim}
                disabled={claiming || !market.claimable}
                className={cn(
                    'w-full py-3 rounded-lg text-[14px] font-bold transition-all transform duration-200',
                    'bg-emerald-400 text-emerald-950 active:translate-y-px',
                    'shadow-[inset_0_-2.5px_0_rgba(0,0,0,0.18)]',
                    claiming || !market.claimable
                        ? 'opacity-40 cursor-not-allowed'
                        : 'cursor-pointer active:scale-[0.99]',
                )}
            >
                {claiming
                    ? 'Claiming…'
                    : market.claimable
                      ? 'Claim payout'
                      : 'Settling on-chain…'}
            </button>
        </div>
    );
}

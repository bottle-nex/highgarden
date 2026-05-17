'use client';
import { JSX, ReactNode, useState } from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { LuShare2 } from 'react-icons/lu';
import { toast } from 'sonner';
import type { PositionDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import trading_api, { TradingError } from '@/lib/api/trading';
import { usePositionsStore } from '@/store/portfolio/usePositionsStore';
import Image from 'next/image';
import { localize_market_title } from '@/utils/localize-et';

const FALLBACK_IMAGE = '/images/icons/btc.webp';

export function MarketIcon({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}): JSX.Element {
    return (
        <div
            className={cn(
                'flex items-center justify-center shrink-0 border-[1.5px] border-white rounded-md overflow-hidden',
                className,
            )}
        >
            {children}
        </div>
    );
}

function MobileStat({ label, children }: { label: string; children: ReactNode }): JSX.Element {
    return (
        <div className="md:hidden flex flex-col gap-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
            <div className="text-sm text-white/85 tabular-nums">{children}</div>
        </div>
    );
}

export default function PositionRow({ position }: { position: PositionDTO }): JSX.Element {
    const isYes = position.outcome === Outcome.YES;
    const [claiming, setClaiming] = useState(false);
    const apply_claim = usePositionsStore((s) => s.applyClaim);

    const handle_redeem = async () => {
        if (claiming || position.claimableUsd <= 0) return;
        setClaiming(true);
        try {
            const result = await trading_api.claim(position.marketId);
            const short = `${result.txSignature.slice(0, 8)}…${result.txSignature.slice(-6)}`;
            toast.success(`Claimed $${position.claimableUsd.toFixed(2)}`, {
                description: `Tx ${short}`,
            });
            apply_claim(position.marketId, position.outcome);
        } catch (err) {
            const msg =
                err instanceof TradingError ? err.user_message : 'Claim failed. Please try again.';
            toast.error(msg);
        } finally {
            setClaiming(false);
        }
    };

    const is_won = position.status === 'WON';
    const is_lost = position.status === 'LOST';
    const status_label = position.status === 'OPEN' ? 'OPEN' : position.status;
    const status_color = is_won
        ? 'text-emerald-400'
        : is_lost
          ? 'text-rose-400'
          : 'text-white/60';

    const has_current_price = position.currentPriceCents !== null;
    return (
        <div className="flex flex-col gap-y-3 md:grid md:grid-cols-[3fr_1fr_1fr_1fr_1fr_auto] md:gap-x-4 md:items-center px-3 py-4 border-b border-neutral-900/80 hover:bg-white/2 transition-colors">
            <div className="flex items-center gap-x-3 min-w-0">
                <MarketIcon className="size-10 bg-neutral-700">
                    <Image
                        src={position.marketImage ?? FALLBACK_IMAGE}
                        alt={position.marketName}
                        width={40}
                        height={40}
                        className="size-10 object-cover"
                    />
                </MarketIcon>
                <div className="min-w-0">
                    <p className="text-sm text-white/95 truncate font-medium">
                        {localize_market_title(position.marketName)}
                    </p>
                    <div className="flex items-center gap-x-2 mt-1.5 flex-wrap">
                        <span
                            className={cn(
                                'inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full font-semibold tabular-nums tracking-wide',
                                isYes
                                    ? 'bg-emerald-600/90 text-white'
                                    : 'bg-rose-500/90 text-white',
                            )}
                        >
                            {isYes ? 'Yes' : 'No'} {position.avgCostCents}¢
                        </span>
                        <span className="text-xs text-white/50 tabular-nums">
                            {position.shares.toLocaleString()} shares
                        </span>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 md:contents">
                <MobileStat label="Avg → Now">
                    <span className="text-white/85">{position.avgCostCents}¢</span>
                    <span className="text-white/35 mx-1">→</span>
                    <span className="text-white/85">
                        {has_current_price ? `${position.currentPriceCents}¢` : '-'}
                    </span>
                </MobileStat>
                <div className="hidden md:block text-sm text-white/75 text-right tabular-nums">
                    <span className="text-white/85">{position.avgCostCents}¢</span>
                    <span className="text-white/35 mx-1">→</span>
                    <span className="text-white/85">
                        {has_current_price ? `${position.currentPriceCents}¢` : '-'}
                    </span>
                </div>
                <MobileStat label="Traded">${position.tradedUsd.toFixed(2)}</MobileStat>
                <div className="hidden md:block text-sm text-white/85 text-right tabular-nums">
                    ${position.tradedUsd.toFixed(2)}
                </div>
                <MobileStat label="To win">${position.toWinUsd.toFixed(2)}</MobileStat>
                <div className="hidden md:block text-sm text-white/85 text-right tabular-nums">
                    ${position.toWinUsd.toFixed(2)}
                </div>
                <div className="md:hidden flex flex-col gap-y-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                        Value
                    </span>
                    <div className="flex items-center gap-x-2">
                        <span
                            className={cn(
                                'text-sm font-semibold tabular-nums leading-tight',
                                status_color,
                                is_lost && 'line-through decoration-rose-400/70 opacity-70',
                            )}
                        >
                            ${position.valueUsd.toFixed(2)}
                        </span>
                        <span
                            className={cn(
                                'inline-flex items-center gap-x-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                                is_won && 'bg-emerald-500/15 text-emerald-400',
                                is_lost && 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40',
                                !is_won && !is_lost && status_color,
                            )}
                        >
                            {is_won && <FaCheckCircle className="size-3" />}
                            {is_lost && <FaTimesCircle className="size-3" />}
                            {status_label}
                        </span>
                    </div>
                </div>
                <div className="hidden md:block text-right">
                    <div
                        className={cn(
                            'inline-flex items-center gap-x-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                            is_won && 'bg-emerald-500/15 text-emerald-400',
                            is_lost && 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40',
                            !is_won && !is_lost && status_color,
                        )}
                    >
                        {is_won && <FaCheckCircle className="size-3" />}
                        {is_lost && <FaTimesCircle className="size-3" />}
                        {status_label}
                    </div>
                    <div
                        className={cn(
                            'text-sm font-semibold tabular-nums leading-tight mt-1',
                            status_color,
                            is_lost && 'line-through decoration-rose-400/70 opacity-70',
                        )}
                    >
                        ${position.valueUsd.toFixed(2)}
                    </div>
                </div>
                <div className="col-span-2 flex items-center justify-end gap-x-2 md:col-span-1 md:pl-2">
                    {position.claimableUsd > 0 && (
                        <Button
                            variant="outline"
                            className="h-9 px-4 text-sm flex-1 md:flex-none"
                            onClick={handle_redeem}
                            disabled={claiming}
                        >
                            {claiming ? 'Claiming…' : 'Redeem'}
                        </Button>
                    )}
                    <Button
                        size="icon"
                        title="Coming soon"
                        aria-label="Share (coming soon)"
                        className="size-9 bg-neutral-800/60 hover:bg-neutral-800 text-white/40 hover:text-white/60 rounded-lg shrink-0"
                        onClick={() => {}}
                    >
                        <LuShare2 />
                    </Button>
                </div>
            </div>
        </div>
    );
}

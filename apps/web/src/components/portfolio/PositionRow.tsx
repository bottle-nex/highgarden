'use client';
import { JSX, ReactNode, useState } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import { LuShare2 } from 'react-icons/lu';
import { toast } from 'sonner';
import type { PositionDTO } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import trading_api, { TradingError } from '@/lib/api/trading';
import { usePositionsStore } from '@/store/portfolio/usePositionsStore';
import Image from 'next/image';

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
                'flex items-center justify-center shrink-0 border-[1.5px] border-white rounded-sm overflow-hidden',
                className,
            )}
        >
            {children}
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
                err instanceof TradingError
                    ? err.user_message
                    : 'Claim failed. Please try again.';
            toast.error(msg);
        } finally {
            setClaiming(false);
        }
    };

    const status_label = position.status === 'OPEN' ? 'OPEN' : position.status;
    const status_color =
        position.status === 'WON'
            ? 'text-green-500'
            : position.status === 'LOST'
              ? 'text-red-500'
              : 'text-white/60';

    return (
        <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_auto] gap-x-4 items-center px-2 py-4 border-t border-neutral-900">
            <div className="flex items-center gap-x-3 min-w-0">
                <MarketIcon className="bg-neutral-700">
                    <Image
                        src={position.marketImage ?? FALLBACK_IMAGE}
                        alt={position.marketName}
                        width={40}
                        height={40}
                    />
                </MarketIcon>
                <div className="min-w-0">
                    <p className="text-sm text-white truncate">{position.marketName}</p>
                    <div className="flex items-center gap-x-2 mt-1">
                        <span
                            className={cn(
                                'text-xs px-2 py-0.5',
                                isYes
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-red-500/15 text-red-400',
                            )}
                        >
                            {isYes ? 'Yes' : 'No'} {position.avgCostCents}¢
                        </span>
                        <span className="text-xs text-white/50">
                            {position.shares.toLocaleString()} shares
                        </span>
                    </div>
                </div>
            </div>
            <div className="text-sm text-white/70">
                {position.avgCostCents}¢ <span className="text-white/40">→</span>{' '}
                {position.currentPriceCents !== null ? `${position.currentPriceCents}¢` : '—'}
            </div>
            <div className="text-sm text-white/70">${position.tradedUsd.toFixed(2)}</div>
            <div className="text-sm text-white/70">${position.toWinUsd.toFixed(2)}</div>
            <div>
                <div className={cn('flex items-center gap-x-1 text-xs', status_color)}>
                    {position.status === 'WON' && <FaCheckCircle className="size-3.5" />}
                    {status_label}
                </div>
                <div className={cn('text-sm font-medium', status_color)}>
                    ${position.valueUsd.toFixed(2)}
                </div>
            </div>
            <div className="flex items-center gap-x-2">
                {position.claimableUsd > 0 && (
                    <Button
                        variant="outline"
                        className="h-9 px-4 text-sm"
                        onClick={handle_redeem}
                        disabled={claiming}
                    >
                        {claiming ? 'Claiming…' : 'Redeem'}
                    </Button>
                )}
                <Button
                    size="icon"
                    className="size-9 bg-neutral-800 hover:bg-neutral-900"
                    onClick={() => {}}
                >
                    <LuShare2 />
                </Button>
            </div>
        </div>
    );
}

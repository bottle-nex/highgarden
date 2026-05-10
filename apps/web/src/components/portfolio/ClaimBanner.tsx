'use client';
import { JSX, useMemo, useState } from 'react';
import { LuTicket } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MarketIcon } from './PositionRow';
import trading_api, { TradingError } from '@/lib/api/trading';
import { selectAllPositions, usePositionsStore } from '@/store/portfolio/usePositionsStore';
import Image from 'next/image';

const FALLBACK_IMAGE = '/images/icons/btc.webp';

export default function ClaimBanner(): JSX.Element | null {
    const positions = usePositionsStore(selectAllPositions);
    const apply_claim = usePositionsStore((s) => s.applyClaim);
    const [claiming, setClaiming] = useState(false);

    const claimable = useMemo(() => positions.filter((p) => p.claimableUsd > 0), [positions]);
    const total = useMemo(() => claimable.reduce((sum, p) => sum + p.claimableUsd, 0), [claimable]);

    if (claimable.length === 0) return null;

    const handle_claim_all = async () => {
        if (claiming) return;
        setClaiming(true);
        const errors: string[] = [];
        for (const p of claimable) {
            try {
                await trading_api.claim(p.marketId);
                apply_claim(p.marketId, p.outcome);
            } catch (err) {
                errors.push(err instanceof TradingError ? err.user_message : 'Claim failed');
            }
        }
        setClaiming(false);
        if (errors.length === 0) {
            toast.success(`Claimed $${total.toFixed(2)}`);
        } else {
            toast.error(`${errors.length} claim(s) failed`);
        }
    };

    const preview = claimable.slice(0, 2);

    return (
        <section className="border border-neutral-900 bg-dark-alpha p-5 flex items-center justify-between">
            <div className="flex items-center gap-x-4">
                <div className="flex items-start">
                    {preview.map((p, i) => (
                        <MarketIcon
                            key={`${p.marketId}-${p.outcome}`}
                            className={
                                i === 0
                                    ? 'bg-neutral-700 relative z-10 -rotate-6'
                                    : 'bg-neutral-700 relative z-0 -ml-5 -mt-1 rotate-6 ring-2 ring-dark-alpha'
                            }
                        >
                            <Image
                                src={p.marketImage ?? FALLBACK_IMAGE}
                                alt={p.marketName}
                                width={40}
                                height={40}
                            />
                        </MarketIcon>
                    ))}
                </div>
                <div className="ml-6 flex items-baseline gap-x-2">
                    <span className="text-white/70">You won</span>
                    <span className="text-white text-2xl font-semibold">${total.toFixed(2)}</span>
                </div>
            </div>
            <Button className="h-10 px-6 text-sm" onClick={handle_claim_all} disabled={claiming}>
                <LuTicket /> {claiming ? 'Claiming…' : 'Claim'}
            </Button>
        </section>
    );
}

'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import ListingRow from './ListingRow';

export interface AdminListingRow {
    marketId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    question: string;
    description: string;
    endAt: string | null;
    polyMarketId: string;
    solanaMarketPda: string | null;
    yesTokenId: string | null;
    noTokenId: string | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    discoveredAt: string;
    approvedAt: string | null;
    approvedBy: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
}

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED';

const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED'];

export default function AdminListings({
    listings,
    onChange,
}: {
    listings: AdminListingRow[];
    onChange?: () => void;
}) {
    const [active, setActive] = useState<Tab>('PENDING');

    const counts = useMemo(() => {
        const c = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<Tab, number>;
        for (const l of listings) c[l.status] += 1;
        return c;
    }, [listings]);

    const visible = useMemo(
        () => listings.filter((l) => l.status === active),
        [listings, active],
    );

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-1 border-b border-white/8">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActive(tab)}
                        className={cn(
                            'px-4 py-2.5 text-[10px] tracking-[0.25em] uppercase border-b-2 -mb-px transition-colors',
                            active === tab
                                ? 'border-amber-400 text-white'
                                : 'border-transparent text-white/45 hover:text-white/75',
                        )}
                    >
                        {tab}{' '}
                        <span className="ml-1 text-white/30 normal-case tracking-normal">
                            ({counts[tab]})
                        </span>
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded p-12 text-center text-xs text-white/40">
                    No {active.toLowerCase()} listings.
                </div>
            ) : (
                <ul className="space-y-2">
                    {visible.map((l) => (
                        <ListingRow key={l.marketId} listing={l} onChange={onChange} />
                    ))}
                </ul>
            )}
        </div>
    );
}

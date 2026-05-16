'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import ListingRow from './ListingRow';
import FastSubscriptionsPanel from './FastSubscriptionsPanel';

export interface AdminListingRow {
    marketId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    /** STANDARD = regular multi-day market. FAST_MOVING = short-window
     *  Polymarket ladder (BTC/ETH/SOL Up-or-Down, etc) — surfaced in its
     *  own tab and resolved on-chain without the dispute window. */
    kind: 'STANDARD' | 'FAST_MOVING';
    /** For FAST_MOVING markets, the rolling-series identifier
     *  (e.g. "bitcoin-updown-5m"). Used by the Subscribe button to
     *  enrol all future markets in this series automatically. */
    fastSeriesKey: string | null;
    question: string;
    description: string;
    endAt: string | null;
    polyMarketId: string;
    polyMarketSlug: string | null;
    imageUrl: string | null;
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

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAST_MOVING';

const TABS: Tab[] = ['PENDING', 'APPROVED', 'REJECTED', 'FAST_MOVING'];

const TAB_LABEL: Record<Tab, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    FAST_MOVING: 'Fast-moving',
};

export default function AdminListings({
    listings,
    onChange,
}: {
    listings: AdminListingRow[];
    onChange?: () => void;
}) {
    const [active, setActive] = useState<Tab>('PENDING');

    const counts = useMemo(() => {
        const c: Record<Tab, number> = {
            PENDING: 0,
            APPROVED: 0,
            REJECTED: 0,
            FAST_MOVING: 0,
        };
        for (const l of listings) {
            c[l.status] += 1;
            // Fast-moving tab shows pending fast-moving markets only —
            // the ones the admin still needs to act on. After approval
            // they appear in the standard APPROVED tab (kind doesn't change).
            if (l.kind === 'FAST_MOVING' && l.status === 'PENDING') c.FAST_MOVING += 1;
        }
        return c;
    }, [listings]);

    const visible = useMemo(() => {
        if (active === 'FAST_MOVING') {
            return listings.filter((l) => l.kind === 'FAST_MOVING' && l.status === 'PENDING');
        }
        // Standard tabs hide fast-moving rows so the noisy 5-min ladders
        // don't drown out the long-form listings the admin actually curates.
        return listings.filter((l) => l.status === active && l.kind !== 'FAST_MOVING');
    }, [listings, active]);

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
                        {TAB_LABEL[tab]}{' '}
                        <span className="ml-1 text-white/30 normal-case tracking-normal">
                            ({counts[tab]})
                        </span>
                    </button>
                ))}
            </div>

            {active === 'FAST_MOVING' && (
                <section className="space-y-3">
                    <div>
                        <h3 className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2">
                            Active subscriptions
                        </h3>
                        <p className="text-[11px] text-white/40 mb-3">
                            Subscribed series auto-approve every new market the auto-lister
                            discovers in that series. Unsubscribing stops future auto-approvals;
                            already-approved markets keep running until they resolve.
                        </p>
                        <FastSubscriptionsPanel onChange={onChange} />
                    </div>
                    <div>
                        <h3 className="text-[11px] tracking-[0.25em] uppercase text-white/55 mb-2 mt-6">
                            Pending fast markets
                        </h3>
                    </div>
                </section>
            )}

            {visible.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded p-12 text-center text-xs text-white/40">
                    {active === 'FAST_MOVING'
                        ? 'No fast-moving markets waiting for approval.'
                        : `No ${TAB_LABEL[active].toLowerCase()} listings.`}
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

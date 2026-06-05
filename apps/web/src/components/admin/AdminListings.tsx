'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AdminListingCounts } from '@/lib/api/admin';
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

export type AdminTab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAST_MOVING';

const TABS: AdminTab[] = ['PENDING', 'APPROVED', 'REJECTED', 'FAST_MOVING'];

const TAB_LABEL: Record<AdminTab, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    FAST_MOVING: 'Fast-moving',
};

interface Props {
    active: AdminTab;
    onActiveChange: (tab: AdminTab) => void;
    counts: AdminListingCounts;
    rows: AdminListingRow[];
    loading: boolean;
    exhausted: boolean;
    error: string | null;
    /** True only on the very first fetch for the active tab — used to
     *  show a "Loading listings…" placeholder rather than the bottom
     *  sentinel spinner. After that the rows render and the sentinel
     *  takes over. */
    initialLoading: boolean;
    onLoadMore: () => void;
    onChange: () => void;
}

export default function AdminListings({
    active,
    onActiveChange,
    counts,
    rows,
    loading,
    exhausted,
    error,
    initialLoading,
    onLoadMore,
    onChange,
}: Props) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    // Latest onLoadMore in a ref so the IntersectionObserver effect doesn't
    // tear down whenever the parent re-renders with a new callback identity.
    const loadMoreRef = useRef(onLoadMore);
    loadMoreRef.current = onLoadMore;

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return;
        if (exhausted) return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) loadMoreRef.current();
                }
            },
            { rootMargin: '320px 0px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [exhausted, active, rows.length]);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-1 border-b border-white/8">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => onActiveChange(tab)}
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

            {initialLoading ? (
                <div className="text-xs text-white/40">Loading listings…</div>
            ) : rows.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded p-12 text-center text-xs text-white/40">
                    {error
                        ? error
                        : active === 'FAST_MOVING'
                          ? 'No fast-moving markets waiting for approval.'
                          : `No ${TAB_LABEL[active].toLowerCase()} listings.`}
                </div>
            ) : (
                <>
                    <ul className="space-y-2">
                        {rows.map((l) => (
                            <ListingRow key={l.marketId} listing={l} onChange={onChange} />
                        ))}
                    </ul>
                    <div ref={sentinelRef} className="pt-2">
                        {loading && !exhausted ? (
                            <div className="text-center text-[11px] text-white/35 py-4">
                                Loading more…
                            </div>
                        ) : exhausted ? (
                            <div className="text-center text-[11px] text-white/25 py-4">
                                End of list
                            </div>
                        ) : (
                            <div className="h-4" />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

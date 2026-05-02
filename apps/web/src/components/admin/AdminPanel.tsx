'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAdminListings, type AdminListingApi } from '@/lib/api/admin';
import AdminListings, { type AdminListingRow } from './AdminListings';
import RunListerButton from './RunListerButton';

function toRow(l: AdminListingApi): AdminListingRow {
    return {
        marketId: l.marketId,
        status: l.status,
        question: l.market?.name ?? '(unknown market)',
        description: l.market?.description ?? '',
        endAt: l.market?.endAt ?? null,
        polyMarketId: l.market?.polyMarketId ?? '',
        polyMarketSlug: l.market?.polymarket?.slug ?? null,
        imageUrl: l.market?.polymarket?.imageUrl ?? null,
        solanaMarketPda: l.market?.solanaMarketPda ?? null,
        yesTokenId: l.market?.polymarket?.yesTokenId ?? null,
        noTokenId: l.market?.polymarket?.noTokenId ?? null,
        volume24hUsd: l.volume24hUsd,
        liquidityUsd: l.liquidityUsd,
        discoveredAt: l.discoveredAt,
        approvedAt: l.approvedAt,
        approvedBy: l.approvedBy,
        rejectedAt: l.rejectedAt,
        rejectionReason: l.rejectionReason,
    };
}

export default function AdminPanel() {
    const [rows, setRows] = useState<AdminListingRow[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchAdminListings();
            setRows(data.map(toRow));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'failed to load listings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return (
        <div className="space-y-8" data-lenis-prevent>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl text-white tracking-wide">Market Curator</h1>
                    <p className="text-xs text-white/50 mt-1">
                        Approve or reject markets discovered from Polymarket. Approved markets are
                        published to the user dashboard and the mirror starts streaming their order
                        book.
                    </p>
                </div>
                <RunListerButton onComplete={refresh} />
            </div>

            {loading ? (
                <div className="text-xs text-white/40">Loading listings…</div>
            ) : (
                <AdminListings listings={rows} onChange={refresh} />
            )}
        </div>
    );
}

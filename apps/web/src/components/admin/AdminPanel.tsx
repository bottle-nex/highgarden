'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ListingStatus } from '@solmarket/types';
import {
    fetchAdminListings,
    fetchAdminListingCounts,
    type AdminListingApi,
    type AdminListingCounts,
    type AdminMarketKind,
} from '@/lib/api/admin';
import AdminListings, { type AdminListingRow, type AdminTab } from './AdminListings';
import RunListerButton from './RunListerButton';
import FundUserButton from './FundUserButton';
import BalanceModalButton from './BalanceModalButton';

const PAGE_SIZE = 40;

const EMPTY_COUNTS: AdminListingCounts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    FAST_MOVING: 0,
};

interface TabState {
    rows: AdminListingRow[];
    nextCursor: string | null;
    loading: boolean;
    exhausted: boolean;
    error: string | null;
}

const EMPTY_TAB_STATE: TabState = {
    rows: [],
    nextCursor: null,
    loading: false,
    exhausted: false,
    error: null,
};

// Server filter parameters for each tab. PENDING/APPROVED/REJECTED show
// standard markets only; the FAST_MOVING tab is the pending+fast subset
// (mirrors what the dashboard hides). Keep this in sync with the counts
// controller on the server.
const TAB_FILTERS: Record<AdminTab, { status: ListingStatus; kind: AdminMarketKind }> = {
    PENDING: { status: ListingStatus.PENDING, kind: 'STANDARD' },
    APPROVED: { status: ListingStatus.APPROVED, kind: 'STANDARD' },
    REJECTED: { status: ListingStatus.REJECTED, kind: 'STANDARD' },
    FAST_MOVING: { status: ListingStatus.PENDING, kind: 'FAST_MOVING' },
};

function toRow(l: AdminListingApi): AdminListingRow {
    return {
        marketId: l.marketId,
        status: l.status,
        kind: l.market?.kind ?? 'STANDARD',
        fastSeriesKey: l.market?.fastSeriesKey ?? null,
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
    const [active, setActive] = useState<AdminTab>('PENDING');
    const [counts, setCounts] = useState<AdminListingCounts>(EMPTY_COUNTS);
    const [tabs, setTabs] = useState<Record<AdminTab, TabState>>({
        PENDING: EMPTY_TAB_STATE,
        APPROVED: EMPTY_TAB_STATE,
        REJECTED: EMPTY_TAB_STATE,
        FAST_MOVING: EMPTY_TAB_STATE,
    });
    // Per-tab in-flight token so a late response from a stale request
    // can't overwrite a tab the user has since reset (or moved away from).
    // A fresh token is minted whenever we start a request; the response is
    // applied only if the token still matches the latest one for that tab.
    const tokens = useRef<Record<AdminTab, number>>({
        PENDING: 0,
        APPROVED: 0,
        REJECTED: 0,
        FAST_MOVING: 0,
    });

    const loadTab = useCallback(async (tab: AdminTab, reset: boolean) => {
        const filter = TAB_FILTERS[tab];
        // Mint a token before flipping `loading` so a concurrent reset can
        // invalidate this request even if React batches the state update.
        const token = (tokens.current[tab] += 1);

        // Snapshot the cursor synchronously so we don't depend on a fresh
        // setState — setState inside React 18 may not have flushed yet,
        // and a stale closure here would re-request page 1 forever.
        let cursor: string | null = null;
        setTabs((prev) => {
            cursor = reset ? null : prev[tab].nextCursor;
            return {
                ...prev,
                [tab]: reset
                    ? { ...EMPTY_TAB_STATE, loading: true }
                    : { ...prev[tab], loading: true, error: null },
            };
        });

        try {
            const page = await fetchAdminListings({
                status: filter.status,
                kind: filter.kind,
                cursor,
                limit: PAGE_SIZE,
            });
            if (tokens.current[tab] !== token) return;
            const next_rows = page.items.map(toRow);
            setTabs((prev) => {
                const existing = reset ? [] : prev[tab].rows;
                return {
                    ...prev,
                    [tab]: {
                        rows: existing.concat(next_rows),
                        nextCursor: page.nextCursor,
                        loading: false,
                        exhausted: page.nextCursor === null,
                        error: null,
                    },
                };
            });
        } catch (err) {
            if (tokens.current[tab] !== token) return;
            const message = err instanceof Error ? err.message : 'failed to load listings';
            setTabs((prev) => ({
                ...prev,
                [tab]: { ...prev[tab], loading: false, error: message },
            }));
            toast.error(message);
        }
    }, []);

    const refreshCounts = useCallback(async () => {
        try {
            const next = await fetchAdminListingCounts();
            setCounts(next);
        } catch {
            // Counts are best-effort — keep the previous values rather than
            // flashing zeros across the tab strip on transient errors.
        }
    }, []);

    // Initial paint: load counts + the default tab's first page in parallel
    // so the dashboard doesn't wait on counts to render the visible list.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshCounts();
        void loadTab('PENDING', true);
    }, [loadTab, refreshCounts]);

    // Lazy-load other tabs on first visit so the user pays only for what
    // they look at — the REJECTED tab in particular can be large.
    const visited = useRef<Set<AdminTab>>(new Set(['PENDING']));
    useEffect(() => {
        if (visited.current.has(active)) return;
        visited.current.add(active);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadTab(active, true);
    }, [active, loadTab]);

    const onChange = useCallback(async () => {
        // Approve/reject mutated server state. Refresh counts + reset the
        // active tab so the row that moved out (or in) reflects reality.
        await Promise.all([refreshCounts(), loadTab(active, true)]);
    }, [refreshCounts, loadTab, active]);

    const onLoadMore = useCallback(() => {
        const state = tabs[active];
        if (state.loading || state.exhausted) return;
        void loadTab(active, false);
    }, [tabs, active, loadTab]);

    const tab_state = tabs[active];
    // First-paint placeholder before any tab has produced its initial
    // response — keep the existing "Loading listings…" text so behavior
    // around the panel mount feels unchanged.
    const initial_loading = useMemo(
        () => tab_state.rows.length === 0 && tab_state.loading,
        [tab_state],
    );

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
                <div className="flex items-center gap-2">
                    <RunListerButton onComplete={onChange} />
                    <BalanceModalButton />
                    <FundUserButton />
                </div>
            </div>

            <AdminListings
                active={active}
                onActiveChange={setActive}
                counts={counts}
                rows={tab_state.rows}
                loading={tab_state.loading}
                exhausted={tab_state.exhausted}
                error={tab_state.error}
                initialLoading={initial_loading}
                onLoadMore={onLoadMore}
                onChange={onChange}
            />
        </div>
    );
}

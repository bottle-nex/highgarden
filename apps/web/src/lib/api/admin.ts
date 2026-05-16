import type { ListingStatus } from '@solmarket/types';
import { apiClient } from '../client.axios';

export type AdminMarketKind = 'STANDARD' | 'FAST_MOVING';

export interface AdminListingApi {
    marketId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    discoveredAt: string;
    approvedAt: string | null;
    approvedBy: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    market: {
        id: string;
        name: string;
        description: string;
        endAt: string;
        polyMarketId: string;
        solanaMarketPda: string | null;
        /** STANDARD = regular long-form market. FAST_MOVING = short-window
         *  Polymarket ladder (BTC/ETH/SOL Up-or-Down etc) that resolves in
         *  minutes — surfaced in a dedicated admin tab. */
        kind: AdminMarketKind;
        /** Stable key for the rolling fast-moving series (e.g.
         *  "bitcoin-updown-5m"). Null for STANDARD markets. */
        fastSeriesKey: string | null;
        polymarket: {
            slug: string | null;
            yesTokenId: string;
            noTokenId: string;
            tickSize: string;
            negRisk: boolean;
            imageUrl: string | null;
        } | null;
    } | null;
}

export interface FastSubscription {
    id: string;
    seriesKey: string;
    label: string;
    enabled: boolean;
    createdAt: string;
    createdBy: string | null;
}

export interface SubscribeResult {
    subscription: FastSubscription;
    backfill: {
        approved: string[];
        failed: { marketId: string; reason: string }[];
    };
}

export interface AutoListerResult {
    discovered: number;
    skippedExisting: number;
    skippedFiltered: number;
    failed: number;
    candidates: number;
}

export async function fetchAdminListings(
    status?: ListingStatus,
    kind?: AdminMarketKind,
): Promise<AdminListingApi[]> {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (kind) params.kind = kind;
    const { data } = await apiClient.get('/admin/listings', {
        params: Object.keys(params).length > 0 ? params : undefined,
    });
    return data?.data ?? [];
}

export async function approveListing(marketId: string, approvedBy?: string): Promise<void> {
    await apiClient.post(`/admin/approve/${marketId}`, approvedBy ? { approvedBy } : {});
}

export async function approveAndListOnSolana(marketId: string, approvedBy?: string): Promise<void> {
    await apiClient.post(`/admin/approve-and-list/${marketId}`, approvedBy ? { approvedBy } : {});
}

export async function rejectListing(marketId: string, reason?: string | null): Promise<void> {
    await apiClient.post(`/admin/reject/${marketId}`, reason ? { reason } : {});
}

export interface AdminResolveMarketResult {
    marketId: string;
    marketPda: string;
    winningOutcome: 'YES' | 'NO';
    txSignature: string;
}

/**
 * Admin-only manual resolve. Mimics the hedger's automatic UMA-based
 * resolver — used in dev / staging when Polymarket markets don't actually
 * resolve on a useful cadence. Requires `SERVER_SOLANA_ORACLE_KEYPAIR`
 * on the server, otherwise the endpoint returns 503 ORACLE_NOT_CONFIGURED.
 */
export async function adminResolveMarket(
    marketId: string,
    winningOutcome: 'YES' | 'NO',
): Promise<AdminResolveMarketResult> {
    const { data } = await apiClient.post(`/admin/resolve-market/${marketId}`, {
        winningOutcome,
    });
    if (!data?.success) {
        throw new Error(data?.message ?? 'resolve failed');
    }
    return data.data as AdminResolveMarketResult;
}

export async function fetchFastSubscriptions(): Promise<FastSubscription[]> {
    const { data } = await apiClient.get('/admin/fast-subscriptions');
    return data?.data ?? [];
}

/**
 * Subscribe to a rolling fast-moving series. Pass `fromMarketId` (the
 * market row the admin clicked Subscribe from) and the server derives
 * the series key from its slug. Backfills approval for every currently
 * pending market in the same series and returns a summary.
 */
export async function subscribeFastSeries(args: {
    fromMarketId?: string;
    seriesKey?: string;
    label?: string;
}): Promise<SubscribeResult> {
    const { data } = await apiClient.post('/admin/fast-subscriptions', args);
    if (!data?.success) throw new Error(data?.message ?? 'subscribe failed');
    return data.data as SubscribeResult;
}

export async function unsubscribeFastSeries(id: string): Promise<void> {
    const { data } = await apiClient.delete(`/admin/fast-subscriptions/${id}`);
    if (!data?.success) throw new Error(data?.message ?? 'unsubscribe failed');
}

export interface FundUserResult {
    email: string;
    userId: string;
    userPubkey: string;
    solTxSignature: string | null;
    usdcTxSignature: string | null;
}

export async function fundUserByEmail(args: {
    email: string;
    solLamports?: number;
    usdcAmount?: number;
}): Promise<FundUserResult> {
    const { data } = await apiClient.post('/admin/fund-by-email', args);
    return data?.data as FundUserResult;
}

export type BalanceSeverity = 'ok' | 'warn' | 'critical' | 'unknown';

export interface BalanceCard {
    amount: number;
    severity: BalanceSeverity;
}

export interface BalanceSnapshot {
    fetchedAt: string;
    solana: {
        configured: boolean;
        adminPubkey: string | null;
        adminSol: BalanceCard;
        treasuryVaultPda: string | null;
        treasuryUsdc: BalanceCard;
    };
    polygon: {
        configured: boolean;
        funderAddress: string | null;
        funderPol: BalanceCard;
        funderPusd: BalanceCard;
    };
    thresholds: {
        sol: { warn: number; critical: number };
        usdcVault: { warn: number; critical: number };
        pol: { warn: number; critical: number };
        pusd: { warn: number; critical: number };
    };
}

export async function fetchAdminBalances(): Promise<BalanceSnapshot> {
    const { data } = await apiClient.get('/admin/balances');
    return data?.data as BalanceSnapshot;
}

export async function runAutoLister(): Promise<AutoListerResult> {
    const { data } = await apiClient.post('/admin/lister/run');
    return (
        data?.data ?? {
            discovered: 0,
            skippedExisting: 0,
            skippedFiltered: 0,
            failed: 0,
            candidates: 0,
        }
    );
}

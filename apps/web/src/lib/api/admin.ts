import type { ListingStatus } from '@solmarket/types';
import { apiClient } from '../client.axios';

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

export interface AutoListerResult {
    discovered: number;
    skippedExisting: number;
    skippedFiltered: number;
    failed: number;
    candidates: number;
}

export async function fetchAdminListings(status?: ListingStatus): Promise<AdminListingApi[]> {
    const { data } = await apiClient.get('/admin/listings', {
        params: status ? { status } : undefined,
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

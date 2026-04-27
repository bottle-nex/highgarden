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
            yesTokenId: string;
            noTokenId: string;
            tickSize: string;
            negRisk: boolean;
        } | null;
    } | null;
}

export interface AutoListerResult {
    discovered: number;
    skippedExisting: number;
    failed: number;
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

export async function rejectListing(marketId: string, reason?: string | null): Promise<void> {
    await apiClient.post(`/admin/reject/${marketId}`, reason ? { reason } : {});
}

export async function runAutoLister(): Promise<AutoListerResult> {
    const { data } = await apiClient.post('/admin/lister/run');
    return data?.data ?? { discovered: 0, skippedExisting: 0, failed: 0 };
}

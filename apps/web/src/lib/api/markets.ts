import type { MarketDTO } from '@solmarket/types';
import { apiClient } from '../client.axios';

export async function fetchPublicMarkets(): Promise<MarketDTO[]> {
    const { data } = await apiClient.get('/markets');
    return data?.data ?? [];
}

export async function fetch_market_by_id(id: string): Promise<MarketDTO | null> {
    try {
        const { data } = await apiClient.get(`/markets/${id}`);
        return data?.data ?? null;
    } catch {
        return null;
    }
}

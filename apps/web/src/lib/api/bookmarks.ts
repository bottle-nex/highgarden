import type { MarketDTO } from '@solmarket/types';
import { apiClient } from '../client.axios';

export async function fetch_bookmarked_markets(): Promise<MarketDTO[]> {
    const { data } = await apiClient.get('/bookmarks');
    return data?.data ?? [];
}

export async function fetch_bookmark_ids(): Promise<string[]> {
    const { data } = await apiClient.get('/bookmarks/ids');
    return data?.data ?? [];
}

export async function add_bookmark(market_id: string): Promise<void> {
    await apiClient.post(`/bookmarks/${market_id}`);
}

export async function remove_bookmark(market_id: string): Promise<void> {
    await apiClient.delete(`/bookmarks/${market_id}`);
}

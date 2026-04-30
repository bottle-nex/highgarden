import type {
    MarketDTO,
    OrderBookSnapshotDTO,
    PriceHistoryDTO,
    PriceHistoryRange,
    RecentTradeDTO,
    Outcome,
} from '@solmarket/types';
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

export async function fetch_market_orderbook(
    market_id: string,
    outcome: Outcome,
    depth = 10,
): Promise<OrderBookSnapshotDTO | null> {
    try {
        const { data } = await apiClient.get(`/markets/${market_id}/orderbook`, {
            params: { outcome, depth },
        });
        return data?.data ?? null;
    } catch {
        return null;
    }
}

export async function fetch_market_price_history(
    market_id: string,
    range: PriceHistoryRange,
): Promise<PriceHistoryDTO | null> {
    try {
        const { data } = await apiClient.get(`/markets/${market_id}/price-history`, {
            params: { range },
        });
        return data?.data ?? null;
    } catch {
        return null;
    }
}

export async function fetch_market_recent_trades(
    market_id: string,
    limit = 50,
): Promise<RecentTradeDTO[]> {
    try {
        const { data } = await apiClient.get(`/markets/${market_id}/trades`, {
            params: { limit },
        });
        return data?.data ?? [];
    } catch {
        return [];
    }
}

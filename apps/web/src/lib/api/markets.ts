import type {
    MarketDTO,
    NewsArticleDTO,
    OrderBookSnapshotDTO,
    PriceHistoryDTO,
    PriceHistoryRange,
    RecentTradeDTO,
    Outcome,
} from '@solmarket/types';
import { apiClient } from '../client.axios';

export async function fetchPublicMarkets(tags?: string[]): Promise<MarketDTO[]> {
    const params = tags && tags.length > 0 ? { tag: tags.join(',') } : undefined;
    const { data } = await apiClient.get('/markets', { params });
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

export async function fetch_market_news(market_id: string, limit = 12): Promise<NewsArticleDTO[]> {
    try {
        const { data } = await apiClient.get(`/markets/${market_id}/news`, {
            params: { limit },
        });
        return data?.data ?? [];
    } catch {
        return [];
    }
}

export async function fetch_recent_news(limit = 10): Promise<NewsArticleDTO[]> {
    try {
        const { data } = await apiClient.get(`/markets/news/recent`, {
            params: { limit },
        });
        return data?.data ?? [];
    } catch {
        return [];
    }
}

export interface RoundAnchorDTO {
    /** Polymarket RTDS symbol — e.g. "btc/usd". */
    symbol: string;
    /** Minute boundary the price applies to, ISO 8601. */
    slotStart: string;
    /** Anchor price in USD as a plain number. */
    price: number;
    /** When the recorder observed the tick. */
    recordedAt: string;
}

/** Fetches the "Price To Beat" anchor for a fast-moving Up/Down market.
 *  Returns null when the market isn't fast-moving, the asset isn't on
 *  Chainlink Data Streams, or the recorder hasn't captured the slot's
 *  starting tick yet — callers should hide the panel in those cases. */
export async function fetch_round_anchor(market_id: string): Promise<RoundAnchorDTO | null> {
    try {
        const { data } = await apiClient.get(`/markets/${market_id}/round-anchor`);
        return data?.data ?? null;
    } catch {
        return null;
    }
}

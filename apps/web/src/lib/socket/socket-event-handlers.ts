import {
    SERVER_MESSAGE_TYPE,
    Outcome,
    ServerMessage,
    MarketEvent,
    Fill,
    PriceUpdatePayload,
} from '@solmarket/types';

import { useMarketsStore } from '@/store/markets/useMarketsStore';
import { useStreamStore } from '@/store/stream/useStreamStore';
import { useFillsStore } from '@/store/portfolio/useFillsStore';
import { usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { useUIStore } from '@/store/ui/useUIStore';
import { enqueueBookUpdate } from '@/store/book/useOrderBookStore';
import {
    enqueueDepthChanges,
    enqueueDepthSnapshot,
    useOrderBookDepthStore,
    type DepthChange,
} from '@/store/book/useOrderBookDepthStore';
import { useLastTradeStore } from '@/store/book/useLastTradeStore';
import { toast } from 'sonner';

interface BookLevel {
    price: number;
    size: number;
}

type TokenMapping = { marketId: string; outcome: Outcome };

export class SocketEventHandlers {
    private static readonly book_cache = new Map<
        string,
        { bids: BookLevel[]; asks: BookLevel[] }
    >();

    /**
     * Seed the per-asset working cache from a REST snapshot so subsequent
     * `price_change` events can apply deltas instead of bailing out for lack
     * of base state.
     */
    static seed_book(asset_id: string, bids: BookLevel[], asks: BookLevel[]): void {
        SocketEventHandlers.book_cache.set(asset_id, {
            bids: bids.map((l) => ({ price: l.price, size: l.size })),
            asks: asks.map((l) => ({ price: l.price, size: l.size })),
        });
    }

    // Build a reverse lookup from Polymarket token ID → { marketId, outcome }
    private static build_token_map(): Map<string, TokenMapping> {
        const map = new Map<string, TokenMapping>();
        const { byId } = useMarketsStore.getState();
        for (const m of Object.values(byId)) {
            if (m.yesTokenId) map.set(m.yesTokenId, { marketId: m.id, outcome: Outcome.YES });
            if (m.noTokenId) map.set(m.noTokenId, { marketId: m.id, outcome: Outcome.NO });
        }
        return map;
    }

    private static best_bid(bids: BookLevel[]): number {
        return bids.reduce((best: number, l: BookLevel) => (l.price > best ? l.price : best), 0);
    }

    private static best_ask(asks: BookLevel[]): number {
        return asks.reduce(
            (best: number, l: BookLevel) => (l.price < best ? l.price : best),
            Infinity,
        );
    }

    private static build_price_payload(
        mapping: TokenMapping,
        bids: BookLevel[],
        asks: BookLevel[],
        timestamp: string,
    ): PriceUpdatePayload {
        const bestBid = SocketEventHandlers.best_bid(bids);
        const bestAsk = asks.length > 0 ? SocketEventHandlers.best_ask(asks) : 1;
        return {
            marketId: mapping.marketId,
            outcome: mapping.outcome,
            bestBid,
            bestAsk,
            // Spread is applied server-side at /quote time — surface raw top-of-book here.
            quotedPrice: bestAsk,
            updatedAt: timestamp,
        };
    }

    private static handle_book(
        event: Extract<MarketEvent, { event_type: 'book' }>,
        tokenMap: Map<string, TokenMapping>,
    ): void {
        const mapping = tokenMap.get(event.asset_id);
        if (!mapping) return;

        const bids: BookLevel[] = event.bids.map((b) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
        }));
        const asks: BookLevel[] = event.asks.map((a) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
        }));

        SocketEventHandlers.book_cache.set(event.asset_id, { bids, asks });

        const payload = SocketEventHandlers.build_price_payload(
            mapping,
            bids,
            asks,
            event.timestamp,
        );
        enqueueBookUpdate(payload);
        enqueueDepthSnapshot(
            mapping.marketId,
            mapping.outcome,
            bids,
            asks,
            new Date(event.timestamp).getTime(),
        );
        useLastTradeStore.getState().apply(payload);
        useStreamStore.getState().markFresh(mapping.marketId);
        console.log(
            `[7.handler→store] book ${mapping.marketId.slice(0, 8)}/${mapping.outcome} bestBid=${payload.bestBid} bestAsk=${payload.bestAsk} depth=${bids.length}+${asks.length}`,
        );
    }

    private static handle_price_change(
        event: Extract<MarketEvent, { event_type: 'price_change' }>,
        tokenMap: Map<string, TokenMapping>,
    ): void {
        const mapping = tokenMap.get(event.asset_id);
        if (!mapping) return;

        const cached = SocketEventHandlers.book_cache.get(event.asset_id);
        if (!cached) {
            // no data yet, skip until new data comes
            return;
        }

        const depth_changes: DepthChange[] = [];
        for (const change of event.changes) {
            const price = parseFloat(change.price);
            const size = parseFloat(change.size);
            const levels = change.side === 'BUY' ? cached.bids : cached.asks;

            const idx = levels.findIndex((l) => l.price === price);
            if (size === 0) {
                if (idx !== -1) levels.splice(idx, 1);
            } else if (idx !== -1) {
                levels[idx].size = size;
            } else {
                levels.push({ price, size });
            }
            depth_changes.push({ price, size, side: change.side });
        }

        const payload = SocketEventHandlers.build_price_payload(
            mapping,
            cached.bids,
            cached.asks,
            event.timestamp,
        );
        enqueueBookUpdate(payload);
        enqueueDepthChanges(
            mapping.marketId,
            mapping.outcome,
            depth_changes,
            new Date(event.timestamp).getTime(),
        );
        useLastTradeStore.getState().apply(payload);
        console.log(
            `[7.handler→store] price_change ${mapping.marketId.slice(0, 8)}/${mapping.outcome} changes=${depth_changes.length} bestBid=${payload.bestBid} bestAsk=${payload.bestAsk}`,
        );
    }

    static handle_market(msg: Extract<ServerMessage, { type: SERVER_MESSAGE_TYPE.MARKET }>): void {
        const tokenMap = SocketEventHandlers.build_token_map();
        const { event } = msg;
        const asset = event.asset_id;
        const trunc = asset.length > 12 ? `${asset.slice(0, 6)}…${asset.slice(-4)}` : asset;
        const mapping = tokenMap.get(asset);
        console.log(
            `[6.client→handler] dispatch type=${event.event_type} asset=${trunc} mapped=${mapping ? `${mapping.marketId.slice(0, 8)}/${mapping.outcome}` : 'NO_MAPPING'}`,
        );

        switch (event.event_type) {
            case 'book':
                SocketEventHandlers.handle_book(event, tokenMap);
                break;
            case 'price_change':
                SocketEventHandlers.handle_price_change(event, tokenMap);
                break;
            case 'tick_size_change':
                // Tick size changes don't affect price display, no-op for now.
                break;
        }
    }

    static handle_subscribed(
        msg: Extract<ServerMessage, { type: SERVER_MESSAGE_TYPE.SUBSCRIBED }>,
    ): void {
        // the server just sends that I'll send data of this market
        console.debug(`[ws] subscribed to token ${msg.token_id}`);
    }

    static handle_unsubscribed(
        msg: Extract<ServerMessage, { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED }>,
    ): void {
        SocketEventHandlers.book_cache.delete(msg.token_id);
        const mapping = SocketEventHandlers.build_token_map().get(msg.token_id);
        if (mapping) {
            useOrderBookDepthStore.getState().clear(mapping.marketId);
        }
    }

    static handle_error(msg: Extract<ServerMessage, { type: SERVER_MESSAGE_TYPE.ERROR }>): void {
        console.error('[ws] server error:', msg.message);
        useUIStore.getState().toast(msg.message, 'error');
    }

    static handle_pong(): void {
        toast.success('PONG');
    }

    static handle_order_filled(fill: Fill): void {
        useFillsStore.getState().push(fill);
        usePositionsStore.getState().applyFill(fill);
    }

    static dispatch(msg: ServerMessage): void {
        switch (msg.type) {
            case SERVER_MESSAGE_TYPE.MARKET:
                SocketEventHandlers.handle_market(msg);
                break;
            case SERVER_MESSAGE_TYPE.SUBSCRIBED:
                SocketEventHandlers.handle_subscribed(msg);
                break;
            case SERVER_MESSAGE_TYPE.UNSUBSCRIBED:
                SocketEventHandlers.handle_unsubscribed(msg);
                break;
            case SERVER_MESSAGE_TYPE.ERROR:
                SocketEventHandlers.handle_error(msg);
                break;
            case SERVER_MESSAGE_TYPE.PONG:
                SocketEventHandlers.handle_pong();
                break;
        }
    }
}

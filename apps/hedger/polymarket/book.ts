import LoggerFactory from "../log/logger";
import PolymarketClientFactory from "./client";

export interface BookTopOfBook {
    bestBidCents: number | null;
    bestAskCents: number | null;
    bestBidSize: number | null;
    bestAskSize: number | null;
}

export default class PolymarketBookService {
    private readonly log = LoggerFactory.for_category("polymarket-book");

    public async fetch_top_of_book(token_id: string): Promise<BookTopOfBook> {
        if (PolymarketClientFactory.is_dry_run()) {
            this.log.debug({ tokenId: token_id }, "dry-run book lookup → 50¢ stub");
            return { bestBidCents: 49, bestAskCents: 51, bestBidSize: 100, bestAskSize: 100 };
        }
        const summary = await PolymarketClientFactory.get_client().getOrderBook(token_id);
        return this.shape_top(summary);
    }

    private shape_top(summary: {
        bids: { price: string; size: string }[];
        asks: { price: string; size: string }[];
    }): BookTopOfBook {
        const top_bid = summary.bids[summary.bids.length - 1];
        const top_ask = summary.asks[summary.asks.length - 1];
        return {
            bestBidCents: top_bid ? Math.round(Number(top_bid.price) * 100) : null,
            bestAskCents: top_ask ? Math.round(Number(top_ask.price) * 100) : null,
            bestBidSize: top_bid ? Number(top_bid.size) : null,
            bestAskSize: top_ask ? Number(top_ask.size) : null,
        };
    }
}

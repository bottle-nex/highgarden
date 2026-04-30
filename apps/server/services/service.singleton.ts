import Redis from "ioredis";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";
import { errorHandler } from "../middleware/error-handler";
import BookCache from "./service.book-cache";
import MirrorControlPublisher from "./service.mirror-control";
import PriceHistoryCache from "./service.price-history-cache";
import TokenIndex from "./service.token-index";
import { ClobClient } from "../polymarket/clob";

export default class Services {
    public redis!: Redis;
    public book_cache!: BookCache;
    public mirror_control!: MirrorControlPublisher;
    public clob!: ClobClient;
    public price_history_cache!: PriceHistoryCache;
    public token_index!: TokenIndex;

    public async boot(): Promise<void> {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        this.book_cache = new BookCache(ENV.SERVER_REDIS_URL);
        this.mirror_control = new MirrorControlPublisher(this.redis);
        this.clob = new ClobClient();
        this.price_history_cache = new PriceHistoryCache();
        this.token_index = new TokenIndex(this.redis);
        await this.token_index.start();
        this.book_cache.label_for = (id) => this.token_index.label(id);
        errorHandler;
    }

    /**
     * Reconcile the durable Redis intent SET, the BookCache, and the token
     * index against the desired set computed from APPROVED listings.
     * Idempotent. Runs on every server boot as the periodic full reconcile.
     */
    public async hydrate(): Promise<void> {
        const approved = await prisma.listing.findMany({
            where: { status: "APPROVED" },
            include: { market: { include: { polymarket: true } } },
        });

        const desired: string[] = [];
        const index_entries: Array<{
            token_id: string;
            entry: { marketId: string; marketName: string; outcome: "YES" | "NO" };
        }> = [];
        for (const l of approved) {
            const poly = l.market?.polymarket;
            const market = l.market;
            if (!poly || !market) continue;
            desired.push(poly.yesTokenId, poly.noTokenId);
            index_entries.push({
                token_id: poly.yesTokenId,
                entry: { marketId: market.id, marketName: market.name, outcome: "YES" },
            });
            index_entries.push({
                token_id: poly.noTokenId,
                entry: { marketId: market.id, marketName: market.name, outcome: "NO" },
            });
        }

        await this.token_index.write(index_entries);

        const { added, removed } = await this.mirror_control.reconcile(desired);
        if (added.length > 0) await this.book_cache.track(added);
        if (removed.length > 0) await this.book_cache.untrack(removed);

        console.log(
            `[services] hydrated ${approved.length} approved market(s) → ${desired.length} desired tokens (added=${added.length}, removed=${removed.length})`,
        );
    }
}

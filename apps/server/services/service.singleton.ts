import Redis from "ioredis";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";
import { errorHandler } from "../middleware/error-handler";
import BookCache from "./service.book-cache";
import MirrorControlPublisher from "./service.mirror-control";
import PriceHistoryCache from "./service.price-history-cache";
import TokenIndex from "./service.token-index";
import NewsService from "./service.news";
import { ClobClient } from "../polymarket/clob";
import SolanaAdminService from "./service.solana-admin";
import NonceSweeperService from "./service.nonce-sweeper";

export default class Services {
    public redis!: Redis;
    public book_cache!: BookCache;
    public mirror_control!: MirrorControlPublisher;
    public clob!: ClobClient;
    public price_history_cache!: PriceHistoryCache;
    public token_index!: TokenIndex;
    public news!: NewsService;
    public solana_admin!: SolanaAdminService;
    public nonce_sweeper!: NonceSweeperService;

    public async boot(): Promise<void> {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        this.book_cache = new BookCache(ENV.SERVER_REDIS_URL);
        this.mirror_control = new MirrorControlPublisher(this.redis);
        this.clob = new ClobClient();
        this.price_history_cache = new PriceHistoryCache();
        this.token_index = new TokenIndex(this.redis);
        this.news = new NewsService();
        this.solana_admin = new SolanaAdminService();
        this.nonce_sweeper = new NonceSweeperService();
        await this.token_index.start();
        this.nonce_sweeper.start();
        errorHandler;
    }

    /**
     * Refresh the token→market index used for cross-pipeline log correlation.
     * Mirroring is now demand-driven: per-WS subscribers populate the intent
     * SET and BookCache on first ref, so we no longer pre-warm everything
     * approved at boot — that would have the mirror pulling Polymarket data
     * for markets nobody is watching.
     */
    public async hydrate(): Promise<void> {
        const approved = await prisma.listing.findMany({
            where: { status: "APPROVED" },
            include: { market: { include: { polymarket: true } } },
        });

        const index_entries: Array<{
            token_id: string;
            entry: { marketId: string; marketName: string; outcome: "YES" | "NO" };
        }> = [];
        for (const l of approved) {
            const poly = l.market?.polymarket;
            const market = l.market;
            if (!poly || !market) continue;
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

        // Wipe any stale intent left over from prior boots so the mirror
        // converges to "nothing followed" until a user subscribes.
        const stale = await this.mirror_control.intent_snapshot();
        if (stale.length > 0) await this.mirror_control.unsubscribe(stale);
    }
}

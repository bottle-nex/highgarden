import Redis from "ioredis";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";
import { errorHandler } from "../middleware/error-handler";
import BookCache from "./service.book-cache";
import MirrorControlPublisher from "./service.mirror-control";

export default class Services {
    public redis!: Redis;
    public book_cache!: BookCache;
    public mirror_control!: MirrorControlPublisher;

    public boot() {
        this.redis = new Redis(ENV.SERVER_REDIS_URL);
        this.book_cache = new BookCache(ENV.SERVER_REDIS_URL);
        this.mirror_control = new MirrorControlPublisher(this.redis);
        errorHandler;
    }

    /**
     * Re-arm the mirror with every approved market and seed the in-memory book
     * cache. Idempotent — safe to call on each server boot. Mirror restarts
     * lose their in-memory subscription registry, so this is what brings them
     * back into sync with the curator's intent.
     */
    public async hydrate(): Promise<void> {
        const approved = await prisma.listing.findMany({
            where: { status: "APPROVED" },
            include: { market: { include: { polymarket: true } } },
        });

        const token_ids: string[] = [];
        for (const l of approved) {
            const poly = l.market?.polymarket;
            if (!poly) continue;
            token_ids.push(poly.yesTokenId, poly.noTokenId);
        }

        if (token_ids.length === 0) {
            console.log("[services] no approved markets to hydrate");
            return;
        }

        await this.book_cache.track(token_ids);
        await this.mirror_control.subscribe(token_ids);
        console.log(
            `[services] hydrated ${approved.length} approved market(s) → ${token_ids.length} token subscriptions`,
        );
    }
}

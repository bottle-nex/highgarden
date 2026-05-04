import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type {
    PolymarketCommentDTO,
    PolymarketCommentPositionDTO,
    PolymarketCommentPositionOutcome,
} from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { GammaClient, type GammaComment } from "../../polymarket/gamma";
import { services } from "../..";

const POSITION_DECIMALS = 1_000_000;
const CACHE_TTL_SECONDS = 60;
const SERIES_ID_CACHE_TTL_SECONDS = 24 * 60 * 60;
const SERIES_ID_NULL_SENTINEL = "__none__";
const MAX_LIMIT = 50;

const gamma = new GammaClient();

/**
 * Cache shape — same as the public DTO but without the per-market `outcome`
 * tag, since the cache is shared across all markets in a series and the tag
 * depends on the *current* market's yes/no token ids.
 */
type UntaggedPosition = Omit<PolymarketCommentPositionDTO, "outcome">;
type UntaggedComment = Omit<PolymarketCommentDTO, "positions"> & {
    positions: UntaggedPosition[];
};

function shorten_wallet(addr: string | null): string | null {
    if (!addr) return null;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shape(c: GammaComment): UntaggedComment {
    return {
        id: c.id,
        body: c.body,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at,
        reactionCount: c.reaction_count,
        author: {
            name: c.profile.name,
            pseudonym: c.profile.pseudonym,
            walletShort: shorten_wallet(c.profile.proxy_wallet ?? c.profile.base_address),
            profileImage: c.profile.profile_image,
        },
        positions: c.profile.positions.map((p) => ({
            tokenId: p.token_id,
            positionUsd: Number(p.position_size) / POSITION_DECIMALS,
        })),
    };
}

function classify_outcome(
    token_id: string,
    yes_token_id: string,
    no_token_id: string,
): PolymarketCommentPositionOutcome {
    if (token_id === yes_token_id) return "YES";
    if (token_id === no_token_id) return "NO";
    return "OTHER";
}

function tag_outcomes(
    comments: UntaggedComment[],
    yes_token_id: string,
    no_token_id: string,
): PolymarketCommentDTO[] {
    return comments.map((c) => ({
        ...c,
        positions: c.positions.map((p) => ({
            ...p,
            outcome: classify_outcome(p.tokenId, yes_token_id, no_token_id),
        })),
    }));
}

export default class GetPolymarketCommentsController {
    static async process(req: Request, res: Response) {
        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) {
            return ResponseWriter.invalid_data(res, "market id required");
        }

        const limit = Math.min(
            Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1),
            MAX_LIMIT,
        );
        const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
        const holders_only = String(req.query.holders_only ?? "false") === "true";

        try {
            const market = await prisma.market.findUnique({
                where: { id: market_id },
                include: { polymarket: true },
            });
            if (!market || !market.polymarket) {
                return ResponseWriter.not_found(res, "market not found");
            }
            const event_id = market.polymarket.eventId;
            if (!event_id) {
                return ResponseWriter.success(
                    res,
                    { eventId: null, comments: [] as PolymarketCommentDTO[] },
                    "Polymarket comments unavailable",
                );
            }

            // Polymarket anchors its comments thread on the parent Series
            // (a recurring set of related events), not on a single Event,
            // so events on their own often look almost empty. Resolve the
            // series id once per event and cache it for a day — series
            // membership is essentially static.
            const series_cache_key = `pm:series_id:${event_id}`;
            let series_id: string | null = null;
            const cached_series_id = await services.redis.get(series_cache_key);
            if (cached_series_id !== null) {
                series_id =
                    cached_series_id === SERIES_ID_NULL_SENTINEL ? null : cached_series_id;
            } else {
                series_id = await gamma.fetch_event_series_id(event_id);
                await services.redis.set(
                    series_cache_key,
                    series_id ?? SERIES_ID_NULL_SENTINEL,
                    "EX",
                    SERIES_ID_CACHE_TTL_SECONDS,
                );
            }

            const scope_type: "Series" | "Event" = series_id ? "Series" : "Event";
            const scope_id = series_id ?? event_id;

            const cache_key = `pm:comments:${scope_type.toLowerCase()}:${scope_id}:${holders_only ? 1 : 0}:${limit}:${offset}`;
            const cached = await services.redis.get(cache_key);
            let untagged: UntaggedComment[];
            let cache_label: string;
            if (cached) {
                untagged = JSON.parse(cached) as UntaggedComment[];
                cache_label = "Polymarket comments (cached)";
            } else {
                const upstream = await gamma.fetch_comments({
                    parent_entity_type: scope_type,
                    parent_entity_id: scope_id,
                    limit,
                    offset,
                    holders_only,
                });
                untagged = upstream.map(shape);
                await services.redis.set(
                    cache_key,
                    JSON.stringify(untagged),
                    "EX",
                    CACHE_TTL_SECONDS,
                );
                cache_label = "Polymarket comments";
            }

            const shaped = tag_outcomes(
                untagged,
                market.polymarket.yesTokenId,
                market.polymarket.noTokenId,
            );

            return ResponseWriter.success(
                res,
                { eventId: event_id, comments: shaped },
                cache_label,
            );
        } catch (err) {
            console.error("[markets/get-polymarket-comments]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

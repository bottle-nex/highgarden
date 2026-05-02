import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type { PolymarketCommentDTO } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { GammaClient, type GammaComment } from "../../polymarket/gamma";
import { services } from "../..";

const POSITION_DECIMALS = 1_000_000;
const CACHE_TTL_SECONDS = 60;
const MAX_LIMIT = 50;

const gamma = new GammaClient();

function shorten_wallet(addr: string | null): string | null {
    if (!addr) return null;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shape(c: GammaComment): PolymarketCommentDTO {
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
        const holders_only = String(req.query.holders_only ?? "true") !== "false";

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

            const cache_key = `pm:comments:${event_id}:${holders_only ? 1 : 0}:${limit}:${offset}`;
            const cached = await services.redis.get(cache_key);
            if (cached) {
                const data = JSON.parse(cached) as PolymarketCommentDTO[];
                return ResponseWriter.success(
                    res,
                    { eventId: event_id, comments: data },
                    "Polymarket comments (cached)",
                );
            }

            const upstream = await gamma.fetch_event_comments({
                event_id,
                limit,
                offset,
                holders_only,
            });
            const shaped = upstream.map(shape);
            await services.redis.set(cache_key, JSON.stringify(shaped), "EX", CACHE_TTL_SECONDS);

            return ResponseWriter.success(
                res,
                { eventId: event_id, comments: shaped },
                "Polymarket comments",
            );
        } catch (err) {
            console.error("[markets/get-polymarket-comments]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

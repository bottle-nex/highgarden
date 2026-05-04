import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type { CommentDTO } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

const MAX_LIMIT = 50;

function shorten_wallet(addr: string | null | undefined): string | null {
    if (!addr) return null;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export default class ListCommentsController {
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

        try {
            const market = await prisma.market.findUnique({
                where: { id: market_id },
                include: { polymarket: { select: { eventId: true } } },
            });
            if (!market) return ResponseWriter.not_found(res, "market not found");
            const event_id = market.polymarket?.eventId;
            if (!event_id) {
                return ResponseWriter.success(
                    res,
                    { eventId: null, comments: [] as CommentDTO[] },
                    "Comments unavailable",
                );
            }

            const rows = await prisma.comment.findMany({
                where: { eventId: event_id },
                orderBy: { createdAt: "desc" },
                take: limit,
                skip: offset,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            walletAddress: true,
                            custodialPublicKey: true,
                        },
                    },
                },
            });

            const dto: CommentDTO[] = rows.map((c) => {
                const username = c.user.name || c.user.email.split("@")[0] || "user";
                const wallet = c.user.walletAddress || c.user.custodialPublicKey;
                return {
                    id: c.id,
                    eventId: c.eventId,
                    body: c.body,
                    reportCount: c.reportCount,
                    createdAt: c.createdAt.toISOString(),
                    author: {
                        userId: c.user.id,
                        username,
                        walletShort: shorten_wallet(wallet),
                    },
                };
            });

            return ResponseWriter.success(res, { eventId: event_id, comments: dto }, "Comments");
        } catch (err) {
            console.error("[comments/list]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

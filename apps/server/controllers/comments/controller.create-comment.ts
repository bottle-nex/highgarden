import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type { CommentDTO } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

const MIN_BODY = 1;
const MAX_BODY = 2000;

function shorten_wallet(addr: string | null | undefined): string | null {
    if (!addr) return null;
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export default class CreateCommentController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) {
            return ResponseWriter.not_authorized(res);
        }

        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) {
            return ResponseWriter.invalid_data(res, "market id required");
        }

        const body_raw = (req.body as { body?: unknown })?.body;
        const body = typeof body_raw === "string" ? body_raw.trim() : "";
        if (body.length < MIN_BODY) {
            return ResponseWriter.invalid_data(res, "comment cannot be empty");
        }
        if (body.length > MAX_BODY) {
            return ResponseWriter.invalid_data(res, `comment exceeds ${MAX_BODY} chars`);
        }

        try {
            const market = await prisma.market.findUnique({
                where: { id: market_id },
                include: { polymarket: { select: { eventId: true } } },
            });
            if (!market) return ResponseWriter.not_found(res, "market not found");
            const event_id = market.polymarket?.eventId;
            if (!event_id) {
                return ResponseWriter.invalid_data(res, "comments unavailable for this market");
            }

            const created = await prisma.comment.create({
                data: { eventId: event_id, userId: user_id, body },
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

            const username = created.user.name || created.user.email.split("@")[0] || "user";
            const wallet = created.user.walletAddress || created.user.custodialPublicKey;
            const dto: CommentDTO = {
                id: created.id,
                eventId: created.eventId,
                body: created.body,
                reportCount: created.reportCount,
                createdAt: created.createdAt.toISOString(),
                author: {
                    userId: created.user.id,
                    username,
                    walletShort: shorten_wallet(wallet),
                },
            };

            return ResponseWriter.created(res, dto, "Comment posted");
        } catch (err) {
            console.error("[comments/create]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

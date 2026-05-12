import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

const body_schema = z.object({
    approvedBy: z.string().nullish(),
});

interface PreparedListing {
    marketId: string;
    polyMarketId: string;
    name: string;
    endAt: Date;
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    existingPda: string | null;
}

export default class ApproveAndListOnSolanaController {
    static async process(req: Request, res: Response) {
        const marketId = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!marketId) return ResponseWriter.invalid_data(res, "marketId required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid approve payload");
        }
        const approvedBy = parsed.data.approvedBy ?? null;

        try {
            const prepared = await ApproveAndListOnSolanaController.prepare(marketId);
            if ("error" in prepared) {
                prepared.error(res);
                return;
            }

            const pda = await ApproveAndListOnSolanaController.ensure_on_chain(prepared.data);
            const updated = await ApproveAndListOnSolanaController.persist_approval(
                marketId,
                pda,
                approvedBy,
            );
            await ApproveAndListOnSolanaController.notify_mirror(marketId);

            return ResponseWriter.success(
                res,
                { ...updated, solanaMarketPda: pda },
                "Listing approved and listed on Solana",
            );
        } catch (err) {
            console.error("[admin/approve-and-list]", err);
            return ResponseWriter.system_error(res);
        }
    }

    private static async prepare(
        marketId: string,
    ): Promise<{ data: PreparedListing } | { error: (_res: Response) => void }> {
        const listing = await prisma.listing.findUnique({
            where: { marketId },
            include: { market: { include: { polymarket: true } } },
        });
        if (!listing) {
            return { error: (res) => ResponseWriter.not_found(res, "listing not found") };
        }
        if (listing.status !== ListingStatus.PENDING) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "LISTING_NOT_PENDING",
                        `listing is ${listing.status}`,
                        undefined,
                        409,
                    ),
            };
        }
        if (!listing.market || !listing.market.polymarket) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_INCOMPLETE",
                        "listing missing polymarket linkage",
                        undefined,
                        422,
                    ),
            };
        }
        if (!services.solana_admin.is_configured()) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "SOLANA_ADMIN_NOT_CONFIGURED",
                        "SERVER_SOLANA_ADMIN_KEYPAIR is not set on the server",
                        undefined,
                        503,
                    ),
            };
        }
        return {
            data: {
                marketId: listing.marketId,
                polyMarketId: listing.market.polyMarketId,
                name: listing.market.name,
                endAt: listing.market.endAt,
                yesTokenId: listing.market.polymarket.yesTokenId,
                noTokenId: listing.market.polymarket.noTokenId,
                tickSize: listing.market.polymarket.tickSize,
                existingPda: listing.market.solanaMarketPda,
            },
        };
    }

    private static async ensure_on_chain(prepared: PreparedListing): Promise<string> {
        if (prepared.existingPda) {
            console.info(
                `[admin/approve-and-list] reusing existing PDA ${prepared.existingPda} for ${prepared.marketId}`,
            );
            return prepared.existingPda;
        }
        const result = await services.solana_admin.create_market({
            polymarketMarketId: prepared.polyMarketId,
            question: prepared.name,
            endAt: prepared.endAt,
            tickSize: prepared.tickSize,
            yesTokenId: prepared.yesTokenId,
            noTokenId: prepared.noTokenId,
        });
        if (result.recovered) {
            console.warn(
                `[admin/approve-and-list] recovered existing on-chain market pda=${result.marketPda} (previous create landed but DB didn't persist; adopting)`,
            );
        } else {
            console.info(
                `[admin/approve-and-list] create_market signature=${result.signature} pda=${result.marketPda}`,
            );
        }
        return result.marketPda;
    }

    private static async persist_approval(
        marketId: string,
        pda: string,
        approvedBy: string | null,
    ) {
        return prisma.$transaction(async (tx) => {
            await tx.market.update({
                where: { id: marketId },
                data: { solanaMarketPda: pda },
            });
            return tx.listing.update({
                where: { marketId },
                data: {
                    status: ListingStatus.APPROVED,
                    approvedAt: new Date(),
                    approvedBy,
                },
                include: { market: { include: { polymarket: true } } },
            });
        });
    }

    private static async notify_mirror(marketId: string): Promise<void> {
        const listing = await prisma.listing.findUnique({
            where: { marketId },
            include: { market: { include: { polymarket: true } } },
        });
        const poly = listing?.market?.polymarket;
        const market = listing?.market;
        if (!poly || !market) return;

        try {
            const token_ids = [poly.yesTokenId, poly.noTokenId];
            await services.token_index.write([
                {
                    token_id: poly.yesTokenId,
                    entry: { marketId: market.id, marketName: market.name, outcome: "YES" },
                },
                {
                    token_id: poly.noTokenId,
                    entry: { marketId: market.id, marketName: market.name, outcome: "NO" },
                },
            ]);
            await services.book_cache.track(token_ids);
            await services.mirror_control.subscribe(token_ids);
        } catch (err) {
            console.error("[admin/approve-and-list] mirror wiring failed", err);
        }
    }
}

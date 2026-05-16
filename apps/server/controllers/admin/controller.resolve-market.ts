import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { Outcome } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

const body_schema = z.object({
    winningOutcome: z.enum(["YES", "NO"]),
});

/**
 * Admin-triggered manual resolution for an approved + on-chain market.
 * Mimics what the hedger's automatic UMA-based resolver does — useful in
 * dev / staging where Polymarket markets don't actually resolve on a
 * useful cadence.
 *
 * Flow:
 *   1. Validate the listing is APPROVED, has a Solana PDA, and isn't
 *      already RESOLVED.
 *   2. Submit `resolve_market` on-chain signed by the server's oracle
 *      keypair.
 *   3. On confirmation, update `Market.status = RESOLVED` + winning
 *      outcome + resolvedAt + clear pausedReason.
 *   4. Mark `ResolverState.stage = SOLANA_RESOLVED` so the hedger's
 *      polling resolver doesn't re-submit the same tx.
 */
export default class ResolveMarketController {
    static async process(req: Request, res: Response) {
        const market_id = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "marketId required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(
                res,
                "Invalid body: winningOutcome must be 'YES' or 'NO'",
            );
        }

        try {
            const prepared = await ResolveMarketController.prepare(market_id);
            if ("error" in prepared) {
                prepared.error(res);
                return;
            }

            const result = await services.solana_admin.resolve_market({
                marketPda: prepared.data.solanaMarketPda,
                winningOutcome: parsed.data.winningOutcome,
            });

            // `result.winningOutcome` may differ from the requested value
            // when the on-chain market was already resolved (we adopt the
            // chain's winner). Persist whichever one actually lives on-chain.
            const resolved_at = await ResolveMarketController.persist_resolution(
                market_id,
                result.winningOutcome,
                result.signature,
            );

            // Push the resolution out to every connected WS client so the
            // event page flips from Buy/Sell to "Claim payout" immediately.
            // Failure here only affects live UX (a refresh recovers), so
            // we log + continue rather than failing the admin response.
            try {
                // Manual admin resolve does both the DB write and the
                // on-chain resolve_market in one shot, so by the time we
                // publish the chain is already settled — claimable=true.
                await services.market_lifecycle.publish_resolved({
                    marketId: market_id,
                    winningOutcome: result.winningOutcome as Outcome,
                    resolvedAt: resolved_at.toISOString(),
                    claimable: true,
                });
            } catch (err) {
                console.error("[admin/resolve-market] lifecycle publish failed", err);
            }

            return ResponseWriter.success(
                res,
                {
                    marketId: market_id,
                    marketPda: prepared.data.solanaMarketPda,
                    winningOutcome: result.winningOutcome,
                    txSignature: result.signature,
                    recovered: result.recovered,
                },
                result.recovered
                    ? "Market was already resolved on-chain; DB updated to match"
                    : "Market resolved on-chain and persisted in DB",
            );
        } catch (err) {
            console.error("[admin/resolve-market]", err);
            const msg = err instanceof Error ? err.message : "resolve failed";
            return ResponseWriter.error(res, "RESOLVE_FAILED", msg, undefined, 500);
        }
    }

    private static async prepare(
        market_id: string,
    ): Promise<
        | { data: { solanaMarketPda: string } }
        | { error: (_res: Response) => void }
    > {
        const market = await prisma.market.findUnique({
            where: { id: market_id },
            select: {
                solanaMarketPda: true,
                status: true,
                listing: { select: { status: true } },
            },
        });
        if (!market) {
            return { error: (res) => ResponseWriter.not_found(res, "market not found") };
        }
        if (market.listing?.status !== "APPROVED") {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "LISTING_NOT_APPROVED",
                        "listing is not approved",
                        undefined,
                        409,
                    ),
            };
        }
        if (!market.solanaMarketPda) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_NOT_LISTED_ON_SOLANA",
                        "market has no on-chain PDA — list on Solana first",
                        undefined,
                        409,
                    ),
            };
        }
        if (market.status === "RESOLVED") {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_ALREADY_RESOLVED",
                        "market is already resolved",
                        undefined,
                        409,
                    ),
            };
        }
        if (!services.solana_admin.is_resolve_configured()) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "ORACLE_NOT_CONFIGURED",
                        "SERVER_SOLANA_ORACLE_KEYPAIR is not set on the server",
                        undefined,
                        503,
                    ),
            };
        }
        return { data: { solanaMarketPda: market.solanaMarketPda } };
    }

    /**
     * Mirror the on-chain resolution into both `Market` and
     * `ResolverState` so the hedger's UMA-based resolver skips this row
     * on its next tick (it filters out `SOLANA_RESOLVED`/`REDEEMED`).
     */
    private static async persist_resolution(
        market_id: string,
        winning_outcome: "YES" | "NO",
        tx_signature: string,
    ): Promise<Date> {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.market.update({
                where: { id: market_id },
                data: {
                    status: "RESOLVED",
                    winningOutcome: winning_outcome,
                    resolvedAt: now,
                    pausedReason: null,
                },
            });
            await tx.resolverState.upsert({
                where: { marketId: market_id },
                create: {
                    marketId: market_id,
                    stage: "SOLANA_RESOLVED",
                    polymarketResolvedAt: now,
                    winningOutcome: winning_outcome,
                    solanaResolveTxSig: tx_signature,
                    solanaResolvedAt: now,
                    notes: "manual_resolve_via_admin",
                },
                update: {
                    stage: "SOLANA_RESOLVED",
                    winningOutcome: winning_outcome,
                    solanaResolveTxSig: tx_signature,
                    solanaResolvedAt: now,
                    polymarketResolvedAt: now,
                },
            });
        });
        return now;
    }
}

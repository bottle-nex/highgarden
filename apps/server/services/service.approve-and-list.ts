import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import { services } from "../index";

export type ApproveAndListErrorCode =
    | "LISTING_NOT_FOUND"
    | "LISTING_NOT_PENDING"
    | "MARKET_INCOMPLETE"
    | "SOLANA_ADMIN_NOT_CONFIGURED";

export class ApproveAndListError extends Error {
    public readonly code: ApproveAndListErrorCode;
    constructor(code: ApproveAndListErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "ApproveAndListError";
    }
}

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

export interface ApproveAndListResult {
    marketId: string;
    solanaMarketPda: string;
    recovered: boolean;
    /** Tx signature of the on-chain create_market, or "recovered" /
     *  "reused" when no new tx was sent. */
    signature: string;
}

/**
 * Service-level implementation of the "Approve & List on Solana" flow.
 * Extracted from {@link ApproveAndListOnSolanaController} so both the
 * manual admin endpoint and the auto-lister (when a fast-market series
 * subscription fires) can share the same path.
 *
 * Idempotency:
 *   - If the market already has a `solanaMarketPda`, it's reused (no
 *     fresh on-chain create).
 *   - If a previous on-chain create landed but the DB write didn't,
 *     `SolanaAdminService.create_market` recovers via PDA lookup.
 *
 * Errors are thrown as `ApproveAndListError` with a typed code; the
 * controller maps each code to an HTTP status.
 */
export default class ApproveAndListService {
    public async approve(market_id: string, approved_by: string | null): Promise<ApproveAndListResult> {
        const prepared = await this.prepare(market_id);
        const pda = await this.ensure_on_chain(prepared);
        await this.persist_approval(market_id, pda, approved_by);
        await this.notify_mirror(market_id);
        return {
            marketId: market_id,
            solanaMarketPda: pda,
            recovered: prepared.existingPda !== null,
            signature: prepared.existingPda ? "reused" : "created",
        };
    }

    private async prepare(market_id: string): Promise<PreparedListing> {
        const listing = await prisma.listing.findUnique({
            where: { marketId: market_id },
            include: { market: { include: { polymarket: true } } },
        });
        if (!listing) {
            throw new ApproveAndListError("LISTING_NOT_FOUND", "listing not found");
        }
        if (listing.status !== ListingStatus.PENDING) {
            throw new ApproveAndListError(
                "LISTING_NOT_PENDING",
                `listing is ${listing.status}`,
            );
        }
        if (!listing.market || !listing.market.polymarket) {
            throw new ApproveAndListError(
                "MARKET_INCOMPLETE",
                "listing missing polymarket linkage",
            );
        }
        if (!services.solana_admin.is_configured()) {
            throw new ApproveAndListError(
                "SOLANA_ADMIN_NOT_CONFIGURED",
                "SERVER_SOLANA_ADMIN_KEYPAIR is not set on the server",
            );
        }
        return {
            marketId: listing.marketId,
            polyMarketId: listing.market.polyMarketId,
            name: listing.market.name,
            endAt: listing.market.endAt,
            yesTokenId: listing.market.polymarket.yesTokenId,
            noTokenId: listing.market.polymarket.noTokenId,
            tickSize: listing.market.polymarket.tickSize,
            existingPda: listing.market.solanaMarketPda,
        };
    }

    private async ensure_on_chain(prepared: PreparedListing): Promise<string> {
        if (prepared.existingPda) {
            console.info(
                `[approve-and-list] reusing existing PDA ${prepared.existingPda} for ${prepared.marketId}`,
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
                `[approve-and-list] recovered existing on-chain market pda=${result.marketPda} (previous create landed but DB didn't persist; adopting)`,
            );
        } else {
            console.info(
                `[approve-and-list] create_market signature=${result.signature} pda=${result.marketPda}`,
            );
        }
        return result.marketPda;
    }

    private async persist_approval(
        market_id: string,
        pda: string,
        approved_by: string | null,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            await tx.market.update({
                where: { id: market_id },
                data: { solanaMarketPda: pda },
            });
            await tx.listing.update({
                where: { marketId: market_id },
                data: {
                    status: ListingStatus.APPROVED,
                    approvedAt: new Date(),
                    approvedBy: approved_by,
                },
            });
        });
    }

    private async notify_mirror(market_id: string): Promise<void> {
        const listing = await prisma.listing.findUnique({
            where: { marketId: market_id },
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
            console.error("[approve-and-list] mirror wiring failed", err);
        }
    }
}

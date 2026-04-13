import type { Request, Response } from "express";
import { prisma, type PrismaClient } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import type { AutoLister } from "../../queue/auto-lister";

export class AdminController {
    constructor(
        private readonly autoLister: AutoLister,
        private readonly db: PrismaClient = prisma,
    ) {}

    listPending = async (_req: Request, res: Response): Promise<void> => {
        const pending = await this.db.listing.findMany({
            where: { status: ListingStatus.PENDING },
            orderBy: { volume24hUsd: "desc" },
            include: { market: { include: { polymarket: true } } },
        });
        res.json(pending);
    };

    listListings = async (req: Request, res: Response): Promise<void> => {
        const statusParam = req.query.status as string | undefined;
        const status = this.parseStatus(statusParam);
        if (statusParam && !status) {
            res.status(400).json({ error: `invalid status: ${statusParam}` });
            return;
        }
        const listings = await this.db.listing.findMany({
            where: status ? { status } : undefined,
            orderBy: { discoveredAt: "desc" },
            include: { market: { include: { polymarket: true } } },
        });
        res.json(listings);
    };

    approve = async (req: Request, res: Response): Promise<void> => {
        const { marketId } = req.params;
        if (!marketId) {
            res.status(400).json({ error: "marketId required" });
            return;
        }
        const approvedBy = (req.body?.approvedBy as string | undefined) ?? null;

        const listing = await this.db.listing.findUnique({ where: { marketId } });
        if (!listing) {
            res.status(404).json({ error: "listing not found" });
            return;
        }
        if (listing.status !== ListingStatus.PENDING) {
            res.status(409).json({ error: `listing is ${listing.status}` });
            return;
        }

        const updated = await this.db.listing.update({
            where: { marketId },
            data: {
                status: ListingStatus.APPROVED,
                approvedAt: new Date(),
                approvedBy,
            },
            include: { market: { include: { polymarket: true } } },
        });
        res.json(updated);
    };

    reject = async (req: Request, res: Response): Promise<void> => {
        const { marketId } = req.params;
        if (!marketId) {
            res.status(400).json({ error: "marketId required" });
            return;
        }
        const reason = (req.body?.reason as string | undefined) ?? null;

        const listing = await this.db.listing.findUnique({ where: { marketId } });
        if (!listing) {
            res.status(404).json({ error: "listing not found" });
            return;
        }
        if (listing.status !== ListingStatus.PENDING) {
            res.status(409).json({ error: `listing is ${listing.status}` });
            return;
        }

        const updated = await this.db.listing.update({
            where: { marketId },
            data: {
                status: ListingStatus.REJECTED,
                rejectedAt: new Date(),
                rejectionReason: reason,
            },
        });
        res.json(updated);
    };

    runLister = async (_req: Request, res: Response): Promise<void> => {
        try {
            const result = await this.autoLister.runOnce();
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    };

    private parseStatus(raw: string | undefined): ListingStatus | null {
        if (!raw) return null;
        if (raw in ListingStatus) return ListingStatus[raw as keyof typeof ListingStatus];
        return null;
    }
}

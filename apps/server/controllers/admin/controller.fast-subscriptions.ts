import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import ApproveAndListService, {
    ApproveAndListError,
} from "../../services/service.approve-and-list";

const body_schema = z.object({
    /** Either `seriesKey` directly (advanced) or a `fromMarketId` whose
     *  series we infer from. Most callers use `fromMarketId` because
     *  it's the natural "subscribe from this row" flow. */
    seriesKey: z.string().min(1).optional(),
    fromMarketId: z.string().min(1).optional(),
    /** Optional human label override. Defaults to "<asset> <cadence>"
     *  derived from the series key. */
    label: z.string().min(1).max(120).optional(),
});

function default_label_from_series(series_key: string): string {
    // "bitcoin-updown-5m" → "Bitcoin Up or Down (5m)"
    const m = series_key.match(/^([a-z0-9]+)-updown-([0-9]+[a-z])$/i);
    if (!m) return series_key;
    const asset = m[1]!;
    const cadence = m[2]!;
    const capitalised = asset.charAt(0).toUpperCase() + asset.slice(1);
    return `${capitalised} Up or Down (${cadence})`;
}

/**
 * Endpoints for managing admin "subscribe to a rolling fast-moving
 * series" preferences. Once subscribed, every new market the
 * auto-lister discovers in that series gets auto-approved + listed
 * on Solana without manual intervention.
 *
 *   GET    /admin/fast-subscriptions       → list all
 *   POST   /admin/fast-subscriptions       → create one + back-approve pending
 *   DELETE /admin/fast-subscriptions/:id   → remove one (existing approved
 *                                            markets keep running)
 *
 * Errors are mapped to typed JSON via ResponseWriter.
 */
export default class FastSubscriptionsController {
    private static approver = new ApproveAndListService();

    static async list(_req: Request, res: Response) {
        try {
            const rows = await prisma.fastMarketSubscription.findMany({
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    seriesKey: true,
                    label: true,
                    enabled: true,
                    createdAt: true,
                    createdBy: true,
                },
            });
            return ResponseWriter.success(
                res,
                rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
                "Subscriptions",
            );
        } catch (err) {
            console.error("[admin/fast-subscriptions:list]", err);
            return ResponseWriter.system_error(res);
        }
    }

    static async create(req: Request, res: Response) {
        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid body");
        }
        if (!parsed.data.seriesKey && !parsed.data.fromMarketId) {
            return ResponseWriter.invalid_data(
                res,
                "Either seriesKey or fromMarketId is required",
            );
        }

        try {
            const series_key = await FastSubscriptionsController.resolve_series_key(parsed.data);
            if (!series_key) {
                return ResponseWriter.error(
                    res,
                    "NO_SERIES_KEY",
                    "Could not derive a series key — market is not a recognised fast-moving series",
                    undefined,
                    422,
                );
            }
            const label = parsed.data.label ?? default_label_from_series(series_key);
            const sub = await prisma.fastMarketSubscription.upsert({
                where: { seriesKey: series_key },
                create: {
                    seriesKey: series_key,
                    label,
                    createdBy: FastSubscriptionsController.who(req),
                },
                update: { enabled: true, label },
                select: {
                    id: true,
                    seriesKey: true,
                    label: true,
                    enabled: true,
                    createdAt: true,
                },
            });

            // Back-fill: approve every currently-PENDING market in this
            // series so the admin doesn't have to. Failures are reported
            // per-row in the response.
            const backfill = await FastSubscriptionsController.backfill_pending(series_key);

            return ResponseWriter.success(
                res,
                {
                    subscription: { ...sub, createdAt: sub.createdAt.toISOString() },
                    backfill,
                },
                "Subscribed",
            );
        } catch (err) {
            console.error("[admin/fast-subscriptions:create]", err);
            return ResponseWriter.system_error(res);
        }
    }

    static async remove(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) return ResponseWriter.invalid_data(res, "id required");
        try {
            await prisma.fastMarketSubscription.delete({ where: { id } });
            return ResponseWriter.success(res, { id }, "Unsubscribed");
        } catch (err) {
            const code = (err as { code?: string }).code;
            if (code === "P2025") {
                return ResponseWriter.not_found(res, "subscription not found");
            }
            console.error("[admin/fast-subscriptions:remove]", err);
            return ResponseWriter.system_error(res);
        }
    }

    private static async resolve_series_key(
        input: { seriesKey?: string; fromMarketId?: string },
    ): Promise<string | null> {
        if (input.seriesKey) return input.seriesKey;
        if (!input.fromMarketId) return null;
        const m = await prisma.market.findUnique({
            where: { id: input.fromMarketId },
            select: { fastSeriesKey: true },
        });
        return m?.fastSeriesKey ?? null;
    }

    /**
     * Approves + lists every currently-PENDING market that belongs to
     * `series_key`. Returns a summary so the UI can show "N approved,
     * M failed" after a subscribe action.
     */
    private static async backfill_pending(
        series_key: string,
    ): Promise<{ approved: string[]; failed: { marketId: string; reason: string }[] }> {
        const pending = await prisma.market.findMany({
            where: {
                fastSeriesKey: series_key,
                kind: "FAST_MOVING",
                listing: { status: "PENDING" },
            },
            select: { id: true },
        });
        const approved: string[] = [];
        const failed: { marketId: string; reason: string }[] = [];
        for (const m of pending) {
            try {
                await FastSubscriptionsController.approver.approve(m.id, "auto-subscribe");
                approved.push(m.id);
            } catch (err) {
                if (err instanceof ApproveAndListError) {
                    failed.push({ marketId: m.id, reason: err.code });
                } else {
                    failed.push({
                        marketId: m.id,
                        reason: (err as Error)?.message ?? "unknown",
                    });
                }
            }
        }
        return { approved, failed };
    }

    private static who(req: Request): string | null {
        return req.user?.email ?? req.user?.id ?? null;
    }
}

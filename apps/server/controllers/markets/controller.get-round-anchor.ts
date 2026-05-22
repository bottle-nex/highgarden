import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { rtds_target_for_series } from "../../services/service.rtds-mapping";

/**
 * Returns the round-start anchor price ("Price To Beat") for a fast-moving
 * Up/Down market. The slot start is `endAt - cadence`, and the recorder
 * service writes one RoundAnchorPrice row per (asset, minute) — so this
 * controller just maps the market's series key + endAt → RTDS symbol +
 * slot-start minute and reads the row.
 *
 * Returns 404 when the market is non-fast-moving, the asset isn't carried
 * on either supported RTDS source, or the recorder hadn't captured a tick
 * by slot start yet.
 */
const CADENCE_MS_BY_SUFFIX: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
};

export default class GetRoundAnchorController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) return ResponseWriter.invalid_data(res, "id required");

        try {
            const listing = await prisma.listing.findUnique({
                where: { marketId: id },
                include: { market: true },
            });
            if (
                !listing
                || listing.status !== ListingStatus.APPROVED
                || !listing.market
                || listing.market.kind !== "FAST_MOVING"
                || !listing.market.fastSeriesKey
            ) {
                return ResponseWriter.not_found(res, "round anchor not available");
            }

            const m = listing.market;
            // Narrowed by the !m.fastSeriesKey guard above, but the union
            // type from Prisma is still string | null — assert it here.
            const series_key = m.fastSeriesKey!;
            const parsed = GetRoundAnchorController.parse_series(series_key);
            if (!parsed) return ResponseWriter.not_found(res, "series not tracked");

            const cadence_ms = parsed.cadence_ms;
            const slot_start_ms = m.endAt.getTime() - cadence_ms;
            // Snap to the minute boundary the recorder writes against —
            // 5/15/60-min slots already align, but defensive against any
            // future cadence that doesn't.
            const minute_ms = Math.floor(slot_start_ms / 60_000) * 60_000;

            const row = await prisma.roundAnchorPrice.findUnique({
                where: {
                    symbol_slotStart: {
                        symbol: parsed.symbol,
                        slotStart: new Date(minute_ms),
                    },
                },
            });
            if (!row) {
                return ResponseWriter.not_found(res, "anchor not captured yet");
            }

            return ResponseWriter.success(
                res,
                {
                    symbol: row.symbol,
                    slotStart: row.slotStart.toISOString(),
                    price: Number(row.price),
                    recordedAt: row.recordedAt.toISOString(),
                },
                "RoundAnchor",
            );
        } catch (err) {
            console.error("[markets/round-anchor]", err);
            return ResponseWriter.system_error(res);
        }
    }

    /** Parses series keys like "btc-updown-5m" into the RTDS symbol the
     *  recorder writes under, plus the slot duration in ms. Returns null
     *  when the asset isn't tracked on RTDS or the cadence suffix is
     *  malformed. */
    private static parse_series(
        series_key: string,
    ): { symbol: string; cadence_ms: number } | null {
        const m = series_key.match(/^([a-z0-9]+)-updown-(\d+)([mh])$/i);
        if (!m) return null;
        const target = rtds_target_for_series(series_key);
        if (!target) return null;
        const value = parseInt(m[2]!, 10);
        const unit = m[3]!.toLowerCase();
        const base = CADENCE_MS_BY_SUFFIX[unit];
        if (!Number.isFinite(value) || value <= 0 || !base) return null;
        return { symbol: target.symbol, cadence_ms: value * base };
    }
}

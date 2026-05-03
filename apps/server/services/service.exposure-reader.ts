import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";

export type CapVerdict =
    | { ok: true }
    | { ok: false; reason: "PAUSED" | "OUT_OF_CAPACITY"; current_usd: number };

export default class ExposureReaderService {
    public async can_quote(market_id: string, notional_usd: number): Promise<CapVerdict> {
        const row = await prisma.exposure.findUnique({ where: { marketId: market_id } });
        if (!row) return { ok: true };

        if (row.paused) {
            return { ok: false, reason: "PAUSED", current_usd: row.unhedgedUsd };
        }
        if (!row.trackerEnabled) return { ok: true };

        const cap = ENV.SERVER_UNHEDGED_DELTA_CAP_USD;
        if (row.unhedgedUsd + notional_usd > cap) {
            return { ok: false, reason: "OUT_OF_CAPACITY", current_usd: row.unhedgedUsd };
        }
        return { ok: true };
    }
}

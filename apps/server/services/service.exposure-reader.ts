import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";

export type CapVerdict =
    | { ok: true }
    | { ok: false; reason: "PAUSED" | "OUT_OF_CAPACITY"; current_usd: number };

/**
 * Convention: `unhedgedUsd > 0` means we owe shares to users that the hedger
 * still needs to BUY on Polymarket. `< 0` means we hold shares users sold to
 * us that the hedger still needs to SELL. So BUY trades push the value up,
 * SELL trades pull it down. The cap is a two-sided bound on absolute
 * exposure: |unhedgedUsd| > cap → reject.
 */
export default class ExposureReaderService {
    public async can_quote(
        market_id: string,
        notional_usd: number,
        side: "BUY" | "SELL",
    ): Promise<CapVerdict> {
        const row = await prisma.exposure.findUnique({ where: { marketId: market_id } });
        if (!row) return { ok: true };

        if (row.paused) {
            return { ok: false, reason: "PAUSED", current_usd: row.unhedgedUsd };
        }
        if (!row.trackerEnabled) return { ok: true };

        const cap = ENV.SERVER_UNHEDGED_DELTA_CAP_USD;
        const signed_delta = side === "BUY" ? notional_usd : -notional_usd;
        const projected = row.unhedgedUsd + signed_delta;
        if (Math.abs(projected) > cap) {
            return { ok: false, reason: "OUT_OF_CAPACITY", current_usd: row.unhedgedUsd };
        }
        return { ok: true };
    }
}

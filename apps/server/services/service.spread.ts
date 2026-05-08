import { ENV } from "../config/config.env";

interface RawLevel {
    price: string;
    size: string;
}

interface RawChange {
    price: string;
    size: string;
    side: "BUY" | "SELL";
}

/**
 * Bakes the platform spread into orderbook prices on the way out to clients.
 * Asks (sells the user can hit when buying) shift up by spread; bids (buys
 * the user can hit when selling) shift down. Cache stays raw — quote pricing
 * uses the unshifted Polymarket book.
 */
export default class SpreadService {
    static apply_to_event(event: unknown): unknown {
        if (!event || typeof event !== "object") return event;
        const obj = event as Record<string, unknown>;
        const cents = ENV.SERVER_QUOTE_SPREAD_CENTS;
        if (cents <= 0) return event;
        const delta = cents / 100;

        if (obj.event_type === "book") {
            return {
                ...obj,
                bids: SpreadService.shift_levels(obj.bids as RawLevel[] | undefined, -delta),
                asks: SpreadService.shift_levels(obj.asks as RawLevel[] | undefined, +delta),
            };
        }
        if (obj.event_type === "price_change") {
            const changes = (obj.changes as RawChange[] | undefined) ?? [];
            const shifted: RawChange[] = [];
            for (const c of changes) {
                const d = c.side === "BUY" ? -delta : +delta;
                const p = SpreadService.shift_price(c.price, d);
                if (p === null) continue;
                shifted.push({ price: p, size: c.size, side: c.side });
            }
            return { ...obj, changes: shifted };
        }
        return event;
    }

    static shift_numeric_levels(
        levels: Array<{ price: number; size: number }>,
        side: "BID" | "ASK",
    ): Array<{ price: number; size: number }> {
        const cents = ENV.SERVER_QUOTE_SPREAD_CENTS;
        if (cents <= 0) return levels;
        const delta = (side === "ASK" ? 1 : -1) * (cents / 100);
        const out: Array<{ price: number; size: number }> = [];
        for (const lvl of levels) {
            const shifted = +(lvl.price + delta).toFixed(4);
            if (shifted <= 0 || shifted >= 1) continue;
            out.push({ price: shifted, size: lvl.size });
        }
        return out;
    }

    static shift_top(price: number | null, side: "BID" | "ASK"): number | null {
        if (price === null) return null;
        const cents = ENV.SERVER_QUOTE_SPREAD_CENTS;
        if (cents <= 0) return price;
        const delta = (side === "ASK" ? 1 : -1) * (cents / 100);
        const shifted = +(price + delta).toFixed(4);
        if (shifted <= 0 || shifted >= 1) return null;
        return shifted;
    }

    private static shift_levels(levels: RawLevel[] | undefined, delta: number): RawLevel[] {
        if (!Array.isArray(levels)) return [];
        const out: RawLevel[] = [];
        for (const lvl of levels) {
            const p = SpreadService.shift_price(lvl.price, delta);
            if (p === null) continue;
            out.push({ price: p, size: lvl.size });
        }
        return out;
    }

    private static shift_price(price_str: string, delta: number): string | null {
        const p = parseFloat(price_str);
        if (!Number.isFinite(p)) return null;
        const shifted = +(p + delta).toFixed(4);
        if (shifted <= 0 || shifted >= 1) return null;
        return String(shifted);
    }
}

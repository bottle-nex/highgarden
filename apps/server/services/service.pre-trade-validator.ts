import { GammaClient } from "../polymarket/gamma";
import BalanceMonitorService from "./service.balance-monitor";

const STATUS_TTL_MS = 30_000;
const BALANCE_TTL_MS = 30_000;

// Minimum pUSD we want to keep in the funder wallet at all times. Even if the
// estimated hedge cost is $5, we don't want to drain to zero — leave a buffer.
const MIN_FUNDER_BUFFER_PUSD = 5;

// Polymarket's CLOB rejects marketable orders whose notional is under $1 on
// either side. If we let such an order through, the user's Solana fill is
// real but the hedge silently fails — leaving the platform short.
const POLYMARKET_MIN_NOTIONAL_USD = 1;

export type ValidationFailure =
    | { ok: false; code: "MARKET_CLOSED_ON_POLYMARKET"; details: string }
    | { ok: false; code: "MARKET_NOT_ACCEPTING_ORDERS"; details: string }
    | { ok: false; code: "BELOW_HEDGE_MIN_NOTIONAL"; details: string }
    | { ok: false; code: "INSUFFICIENT_FUNDER_BALANCE"; details: string };

export type ValidationResult = { ok: true } | ValidationFailure;

interface CacheSlot<V> {
    value: V;
    expires_at: number;
}

export interface ValidateInput {
    polymarketMarketId: string;
    /** Trade direction. SELL doesn't drain pUSD — hedger receives it. */
    side: "BUY" | "SELL";
    /** Estimated max pUSD the bot would need to spend to hedge this trade. */
    estimatedHedgeCostUsd: number;
    /**
     * Hedge notional priced at the raw Polymarket top-of-book (no spread).
     * Used to gate orders below Polymarket's $1 minimum. Pass 0 if the book
     * is not yet warmed — that fails closed.
     */
    polymarketNotionalUsd: number;
}

export default class PreTradeValidator {
    private readonly gamma = new GammaClient();
    private readonly balance_monitor = new BalanceMonitorService();
    private readonly status_cache = new Map<
        string,
        CacheSlot<{ closed: boolean; archived: boolean; accepting_orders: boolean }>
    >();
    private balance_cache: CacheSlot<number> | null = null;

    public async validate(input: ValidateInput): Promise<ValidationResult> {
        const market_check = await this.check_market_status(input.polymarketMarketId);
        if (market_check && !market_check.ok) return market_check;

        if (input.polymarketNotionalUsd < POLYMARKET_MIN_NOTIONAL_USD) {
            return {
                ok: false,
                code: "BELOW_HEDGE_MIN_NOTIONAL",
                details: `polymarket requires $${POLYMARKET_MIN_NOTIONAL_USD.toFixed(2)} min notional — this order is $${input.polymarketNotionalUsd.toFixed(2)}`,
            };
        }

        // SELL hedges generate pUSD on Polymarket; no funder outflow to gate.
        if (input.side === "BUY") {
            const balance_check = await this.check_funder_balance(input.estimatedHedgeCostUsd);
            if (!balance_check.ok) return balance_check;
        }

        return { ok: true };
    }

    private async check_market_status(
        polymarket_market_id: string,
    ): Promise<ValidationResult | null> {
        const status = await this.get_status_cached(polymarket_market_id);
        if (!status) return null; // gamma unreachable — fail open, server should still be usable
        if (status.closed || status.archived) {
            return {
                ok: false,
                code: "MARKET_CLOSED_ON_POLYMARKET",
                details: `polymarket market ${polymarket_market_id} is closed`,
            };
        }
        if (!status.accepting_orders) {
            return {
                ok: false,
                code: "MARKET_NOT_ACCEPTING_ORDERS",
                details: `polymarket market ${polymarket_market_id} is not accepting orders`,
            };
        }
        return { ok: true };
    }

    private async get_status_cached(
        polymarket_market_id: string,
    ): Promise<{ closed: boolean; archived: boolean; accepting_orders: boolean } | null> {
        const slot = this.status_cache.get(polymarket_market_id);
        if (slot && slot.expires_at > Date.now()) return slot.value;
        const fresh = await this.gamma.fetch_market_status(polymarket_market_id);
        if (!fresh) return null;
        this.status_cache.set(polymarket_market_id, {
            value: fresh,
            expires_at: Date.now() + STATUS_TTL_MS,
        });
        return fresh;
    }

    private async check_funder_balance(estimated_cost_usd: number): Promise<ValidationResult> {
        const balance = await this.get_balance_cached();
        if (balance === null) {
            return { ok: true }; // balance unreadable — fail open rather than block all trading
        }
        const required = Math.max(estimated_cost_usd, 0) + MIN_FUNDER_BUFFER_PUSD;
        if (balance < required) {
            return {
                ok: false,
                code: "INSUFFICIENT_FUNDER_BALANCE",
                details: `funder pUSD ${balance.toFixed(2)} < required ${required.toFixed(2)}`,
            };
        }
        return { ok: true };
    }

    private async get_balance_cached(): Promise<number | null> {
        if (this.balance_cache && this.balance_cache.expires_at > Date.now()) {
            return this.balance_cache.value;
        }
        try {
            const snapshot = await this.balance_monitor.fetch_all();
            const fresh = snapshot.polygon.configured ? snapshot.polygon.funderPusd.amount : null;
            if (fresh !== null) {
                this.balance_cache = { value: fresh, expires_at: Date.now() + BALANCE_TTL_MS };
            }
            return fresh;
        } catch {
            return null;
        }
    }
}

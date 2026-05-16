import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import {
    ListingStatus,
    Outcome,
    type OrderBookSnapshotDTO,
    type OrderBookStatus,
} from "@solmarket/types";
import SpreadService from "../../services/service.spread";
import { services, socket_server } from "../../index";
import ResponseWriter from "../../services/service.response";

const DEFAULT_DEPTH = 10;
const MAX_DEPTH = 50;

/** Time the Polymarket-direct fallback waits before bailing. The CLOB
 *  REST endpoint usually responds in <300ms; 2s is generous without
 *  letting a stuck connection block the entire orderbook handler. */
const POLYMARKET_FALLBACK_TIMEOUT_MS = 2_000;

/** Short shared cache for the direct-Polymarket fallback. Multiple
 *  concurrent clients hitting the same token within this window reuse
 *  one upstream fetch, so a hundred users polling a freshly-listed
 *  market every 1.5s don't translate into hundreds of CLOB hits. */
const FALLBACK_CACHE_TTL_MS = 750;

interface RawLevels {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
}

interface FallbackCacheEntry {
    snap: RawLevels | null;
    fetched_at: number;
    in_flight: Promise<RawLevels | null> | null;
}

const fallback_cache = new Map<string, FallbackCacheEntry>();

function parse_polymarket_levels(raw: unknown): Array<{ price: number; size: number }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ price: number; size: number }> = [];
    for (const x of raw) {
        const o = x as { price?: string; size?: string };
        const p = Number(o.price);
        const s = Number(o.size);
        if (Number.isFinite(p) && s > 0) out.push({ price: p, size: s });
    }
    return out;
}

async function do_fetch_polymarket(token_id: string): Promise<RawLevels | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POLYMARKET_FALLBACK_TIMEOUT_MS);
    try {
        const res = await fetch(`https://clob.polymarket.com/book?token_id=${token_id}`, {
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { bids?: unknown; asks?: unknown };
        const bids = parse_polymarket_levels(data.bids).sort((a, b) => b.price - a.price);
        const asks = parse_polymarket_levels(data.asks).sort((a, b) => a.price - b.price);
        return { bids, asks };
    } catch (err) {
        console.warn("[orderbook:fallback] polymarket fetch failed", token_id, err);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Direct-Polymarket fallback used when the mirror-fed cache is empty —
 * which happens for the few seconds after a freshly-auto-approved
 * FAST_MOVING slot is first viewed. Without this fallback the user
 * sees a static "no open orders" frame until the mirror's WS subscribe
 * round-trip completes. Coalesces concurrent calls and serves a recent
 * snapshot for FALLBACK_CACHE_TTL_MS to keep upstream load sane.
 */
async function fetch_polymarket_fallback(token_id: string): Promise<RawLevels | null> {
    const now = Date.now();
    const existing = fallback_cache.get(token_id);
    if (existing) {
        if (existing.in_flight) return existing.in_flight;
        if (existing.snap && now - existing.fetched_at < FALLBACK_CACHE_TTL_MS) {
            return existing.snap;
        }
    }
    const promise = do_fetch_polymarket(token_id);
    const entry: FallbackCacheEntry = {
        snap: existing?.snap ?? null,
        fetched_at: existing?.fetched_at ?? 0,
        in_flight: promise,
    };
    fallback_cache.set(token_id, entry);
    try {
        const snap = await promise;
        entry.snap = snap;
        entry.fetched_at = Date.now();
        entry.in_flight = null;
        return snap;
    } catch {
        entry.in_flight = null;
        return null;
    }
}

export default class GetOrderBookController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        const outcome_param = String(req.query.outcome ?? "").toUpperCase();
        if (outcome_param !== Outcome.YES && outcome_param !== Outcome.NO) {
            return ResponseWriter.invalid_data(res, "outcome must be YES or NO");
        }
        const outcome = outcome_param as Outcome;

        const depth_param = Number(req.query.depth ?? DEFAULT_DEPTH);
        const depth = Number.isFinite(depth_param)
            ? Math.min(MAX_DEPTH, Math.max(1, Math.floor(depth_param)))
            : DEFAULT_DEPTH;

        try {
            const listing = await prisma.listing.findUnique({
                where: { marketId: id },
                include: { market: { include: { polymarket: true } } },
            });

            if (
                !listing ||
                listing.status !== ListingStatus.APPROVED ||
                !listing.market ||
                !listing.market.polymarket
            ) {
                return ResponseWriter.not_found(res, "market not found");
            }

            const p = listing.market.polymarket;
            const token_id = outcome === Outcome.YES ? p.yesTokenId : p.noTokenId;

            // Self-heal: ensure mirror is following this token. Uses TTL-based
            // lifecycle separate from the WS ref counter — no phantom refs.
            socket_server.subscriber.touch_http(token_id);

            const tracked = services.book_cache.has_token(token_id);
            const depth_view = services.book_cache.get_depth(token_id, depth);
            const top = services.book_cache.getTopOfBook(token_id);

            let status: OrderBookStatus;
            let raw_bids = depth_view?.bids ?? [];
            let raw_asks = depth_view?.asks ?? [];
            let raw_best_bid = top?.bestBid ?? null;
            let raw_best_ask = top?.bestAsk ?? null;
            let raw_mid = top?.midPrice ?? null;
            let updated_at = top?.updatedAt ?? Date.now();

            if (!tracked) {
                status = "NOT_TRACKED";
                // Mirror subscribe is handled above by touch_http. Here we just
                // refresh the token→market index used for cross-pipeline log
                // correlation; idempotent and safe to call on every miss.
                void services.token_index
                    .write([
                        {
                            token_id: p.yesTokenId,
                            entry: {
                                marketId: listing.market.id,
                                marketName: listing.market.name,
                                outcome: "YES",
                            },
                        },
                        {
                            token_id: p.noTokenId,
                            entry: {
                                marketId: listing.market.id,
                                marketName: listing.market.name,
                                outcome: "NO",
                            },
                        },
                    ])
                    .catch(() => {});
            } else if (raw_bids.length === 0 && raw_asks.length === 0) {
                status = "TRACKED_EMPTY";
            } else {
                status = "TRACKED";
            }

            // Cold-start fallback: when the mirror hasn't started streaming
            // for this token yet (NOT_TRACKED) or has but Polymarket's first
            // book event hasn't arrived (TRACKED_EMPTY), reach directly into
            // Polymarket's CLOB so the client doesn't sit on an empty frame
            // for several seconds. The mirror will warm up via touch_http
            // above and subsequent polls will read from the live cache.
            if (raw_bids.length === 0 && raw_asks.length === 0) {
                const fresh = await fetch_polymarket_fallback(token_id);
                if (fresh && (fresh.bids.length > 0 || fresh.asks.length > 0)) {
                    raw_bids = fresh.bids.slice(0, depth);
                    raw_asks = fresh.asks.slice(0, depth);
                    raw_best_bid = raw_bids[0]?.price ?? null;
                    raw_best_ask = raw_asks[0]?.price ?? null;
                    raw_mid =
                        raw_best_bid !== null && raw_best_ask !== null
                            ? (raw_best_bid + raw_best_ask) / 2
                            : null;
                    updated_at = Date.now();
                    status = "TRACKED";
                }
            }

            const shifted_bids = SpreadService.shift_numeric_levels(raw_bids, "BID");
            const shifted_asks = SpreadService.shift_numeric_levels(raw_asks, "ASK");
            const best_bid = SpreadService.shift_top(raw_best_bid, "BID");
            const best_ask = SpreadService.shift_top(raw_best_ask, "ASK");
            const mid_price =
                best_bid !== null && best_ask !== null
                    ? +((best_bid + best_ask) / 2).toFixed(4)
                    : raw_mid;

            const dto: OrderBookSnapshotDTO = {
                marketId: id,
                outcome,
                tokenId: token_id,
                status,
                bids: shifted_bids,
                asks: shifted_asks,
                bestBid: best_bid,
                bestAsk: best_ask,
                midPrice: mid_price,
                updatedAt: updated_at,
            };

            return ResponseWriter.success(res, dto, "OrderBook");
        } catch (err) {
            console.error("[markets/get-orderbook]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

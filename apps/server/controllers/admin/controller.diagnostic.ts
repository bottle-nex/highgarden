import type { Request, Response } from "express";
import { REDIS_CHANNELS } from "@solmarket/polymarket-contracts";
import { services } from "../../index";
import { socket_server } from "../../index";
import ResponseWriter from "../../services/service.response";

interface MirrorRegistryDoc {
    tokens?: string[];
    at?: number;
}

/**
 * Single GET that consolidates:
 *   - intent SET (what mirror SHOULD follow per curator)
 *   - BookCache (what server has prices for)
 *   - WS clients (which tokens have live browser subscribers)
 *   - mirror registry + last-seen heartbeat (is mirror alive and aligned?)
 *
 * If any of these views disagree, that's the bug — and now visible.
 */
export default class DiagnosticController {
    static async process(_req: Request, res: Response) {
        try {
            const intent_tokens = await services.mirror_control.intent_snapshot();
            const cache_tracked = services.book_cache.snapshot_tracked();
            const ws_clients = socket_server.snapshot_clients();
            const mirror = await read_mirror_registry();

            const intent = intent_tokens.map((tokenId) => {
                const entry = services.token_index.get(tokenId);
                return {
                    tokenId,
                    marketId: entry?.marketId ?? null,
                    marketName: entry?.marketName ?? null,
                    outcome: entry?.outcome ?? null,
                };
            });

            const book_cache = cache_tracked.map((row) => {
                const entry = services.token_index.get(row.token_id);
                return {
                    tokenId: row.token_id,
                    marketId: entry?.marketId ?? null,
                    marketName: entry?.marketName ?? null,
                    outcome: entry?.outcome ?? null,
                    top: row.top,
                    bidLevels: row.bid_levels,
                    askLevels: row.ask_levels,
                };
            });

            const per_token: Array<{
                tokenId: string;
                marketId: string | null;
                marketName: string | null;
                outcome: "YES" | "NO" | null;
                clients: number;
            }> = [];
            for (const [tokenId, count] of ws_clients) {
                const entry = services.token_index.get(tokenId);
                per_token.push({
                    tokenId,
                    marketId: entry?.marketId ?? null,
                    marketName: entry?.marketName ?? null,
                    outcome: entry?.outcome ?? null,
                    clients: count,
                });
            }

            return ResponseWriter.success(
                res,
                {
                    intent: { tokens: intent },
                    bookCache: { tracked: book_cache },
                    wsClients: { perToken: per_token, distinctTokens: ws_clients.size },
                    mirror,
                },
                "Diagnostic",
            );
        } catch (err) {
            console.error("[admin/diagnostic]", err);
            return ResponseWriter.system_error(res);
        }
    }
}

async function read_mirror_registry(): Promise<{
    registryTokens: string[] | null;
    lastSeenAt: number | null;
    ageMs: number | null;
}> {
    const raw = await services.redis.get(REDIS_CHANNELS.mirror_registry_key);
    if (!raw) {
        return { registryTokens: null, lastSeenAt: null, ageMs: null };
    }
    try {
        const doc = JSON.parse(raw) as MirrorRegistryDoc;
        const at = typeof doc?.at === "number" ? doc.at : null;
        return {
            registryTokens: Array.isArray(doc?.tokens) ? doc.tokens : null,
            lastSeenAt: at,
            ageMs: at !== null ? Date.now() - at : null,
        };
    } catch {
        return { registryTokens: null, lastSeenAt: null, ageMs: null };
    }
}

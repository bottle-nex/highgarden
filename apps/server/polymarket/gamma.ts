/**
 * Public, snake_case shape that the rest of the server consumes. The real
 * Polymarket Gamma API returns camelCase fields with token IDs encoded as a
 * JSON string — this client normalises both into a stable shape so that
 * `auto-lister`, `mirror-control`, and the future quote endpoint don't have
 * to know about upstream renames.
 */
export interface GammaToken {
    token_id: string;
    outcome: "Yes" | "No";
}

export interface GammaMarket {
    id: string;
    slug: string;
    question: string;
    description: string;
    end_date_iso: string;
    volume_24hr: number;
    liquidity: number;
    minimum_tick_size: string;
    neg_risk: boolean;
    image_url: string | null;
    tokens: GammaToken[];
    event_id: string | null;
    event_slug: string | null;
}

export interface FetchMarketsParams {
    limit?: number;
    offset?: number;
    order?: "volume_24hr" | "liquidity" | "start_date";
    ascending?: boolean;
}

export interface FetchEventsParams {
    limit?: number;
    offset?: number;
    order?: "volume_24hr" | "liquidity" | "start_date";
    ascending?: boolean;
}

export interface FetchEventCommentsParams {
    event_id: string;
    limit?: number;
    offset?: number;
    holders_only?: boolean;
}

export interface GammaCommentPosition {
    token_id: string;
    position_size: string;
}

export interface GammaCommentReaction {
    reaction_type: string;
    user_address: string | null;
}

export interface GammaCommentProfile {
    name: string | null;
    pseudonym: string | null;
    proxy_wallet: string | null;
    base_address: string | null;
    profile_image: string | null;
    positions: GammaCommentPosition[];
}

export interface GammaComment {
    id: string;
    body: string;
    parent_comment_id: string | null;
    user_address: string | null;
    created_at: string;
    reaction_count: number;
    profile: GammaCommentProfile;
    reactions: GammaCommentReaction[];
}

/**
 * Raw response shape from https://gamma-api.polymarket.com/markets — only the
 * fields we actually read. Field names mirror the upstream camelCase. Kept
 * private to this file.
 */
interface RawGammaMarket {
    id: string | number;
    slug?: string;
    question?: string;
    description?: string;
    endDate?: string;
    volume24hr?: number;
    liquidityNum?: number;
    orderPriceMinTickSize?: number;
    negRisk?: boolean;
    closed?: boolean;
    archived?: boolean;
    active?: boolean;
    acceptingOrders?: boolean;
    enableOrderBook?: boolean;
    clobTokenIds?: string;
    outcomes?: string;
    image?: string;
}

interface RawGammaEvent {
    id: string | number;
    slug?: string;
    title?: string;
    markets?: RawGammaMarket[];
}

interface RawGammaCommentPosition {
    tokenId?: string | null;
    positionSize?: string | null;
}

interface RawGammaCommentReaction {
    reactionType?: string | null;
    userAddress?: string | null;
}

interface RawGammaCommentProfile {
    name?: string | null;
    pseudonym?: string | null;
    proxyWallet?: string | null;
    baseAddress?: string | null;
    profileImage?: string | null;
    positions?: RawGammaCommentPosition[];
}

interface RawGammaComment {
    id: string | number;
    body?: string | null;
    parentCommentID?: string | null;
    userAddress?: string | null;
    createdAt?: string | null;
    reactionCount?: number | null;
    profile?: RawGammaCommentProfile;
    reactions?: RawGammaCommentReaction[];
}

const ORDER_FIELD_MAP: Record<NonNullable<FetchMarketsParams["order"]>, string> = {
    volume_24hr: "volume24hr",
    liquidity: "liquidityNum",
    start_date: "startDate",
};

const DEFAULT_GAMMA_URL = "https://gamma-api.polymarket.com";

export class GammaClient {
    private readonly base_url: string;

    // Reads process.env directly — this constructor runs at module-load time
    // (auto-lister.service.ts builds it eagerly), which is before
    // Env.parse_env() populates the validated ENV object in index.ts.
    constructor(base_url: string = process.env.SERVER_POLYMARKET_GAMMA_URL ?? DEFAULT_GAMMA_URL) {
        this.base_url = base_url;
    }

    async fetch_markets(params: FetchMarketsParams = {}): Promise<GammaMarket[]> {
        const url = new URL("/markets", this.base_url);
        url.searchParams.set("limit", String(params.limit ?? 50));
        if (params.offset !== undefined) {
            url.searchParams.set("offset", String(params.offset));
        }
        url.searchParams.set("order", ORDER_FIELD_MAP[params.order ?? "volume_24hr"]);
        url.searchParams.set("ascending", String(params.ascending ?? false));
        url.searchParams.set("active", "true");
        url.searchParams.set("closed", "false");
        url.searchParams.set("archived", "false");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaMarket[];
        return raw
            .map((m) => normalise(m, null, null))
            .filter((m): m is GammaMarket => m !== null);
    }

    async fetch_events(params: FetchEventsParams = {}): Promise<GammaMarket[]> {
        const url = new URL("/events", this.base_url);
        url.searchParams.set("limit", String(params.limit ?? 50));
        if (params.offset !== undefined) {
            url.searchParams.set("offset", String(params.offset));
        }
        url.searchParams.set("order", ORDER_FIELD_MAP[params.order ?? "volume_24hr"]);
        url.searchParams.set("ascending", String(params.ascending ?? false));
        url.searchParams.set("active", "true");
        url.searchParams.set("closed", "false");
        url.searchParams.set("archived", "false");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma events fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaEvent[];

        const flattened: GammaMarket[] = [];
        for (const event of raw) {
            const event_id = String(event.id);
            const event_slug = event.slug ?? null;
            for (const m of event.markets ?? []) {
                const normalised = normalise(m, event_id, event_slug);
                if (normalised) flattened.push(normalised);
            }
        }
        return flattened;
    }

    async fetch_event_id_for_market(market_id: string): Promise<{
        event_id: string;
        event_slug: string | null;
    } | null> {
        const url = new URL("/events", this.base_url);
        url.searchParams.set("related_markets", market_id);
        url.searchParams.set("limit", "1");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(
                `gamma related-events fetch failed: ${res.status} ${res.statusText}`,
            );
        }
        const raw = (await res.json()) as RawGammaEvent[];
        if (raw.length === 0) return null;
        const first = raw[0];
        if (!first) return null;
        return {
            event_id: String(first.id),
            event_slug: first.slug ?? null,
        };
    }

    async fetch_event_comments(params: FetchEventCommentsParams): Promise<GammaComment[]> {
        const url = new URL("/comments", this.base_url);
        url.searchParams.set("parent_entity_type", "Event");
        url.searchParams.set("parent_entity_id", params.event_id);
        url.searchParams.set("limit", String(params.limit ?? 30));
        url.searchParams.set("offset", String(params.offset ?? 0));
        url.searchParams.set("get_positions", "true");
        url.searchParams.set("order", "createdAt");
        url.searchParams.set("ascending", "false");
        if (params.holders_only) {
            url.searchParams.set("holders_only", "true");
        }

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(
                `gamma comments fetch failed: ${res.status} ${res.statusText}`,
            );
        }
        const raw = (await res.json()) as RawGammaComment[];
        return raw.map(normalise_comment);
    }

    static pick_yes_no_token_ids(market: GammaMarket): {
        yes_token_id: string;
        no_token_id: string;
    } {
        const yes = market.tokens.find((t) => t.outcome === "Yes");
        const no = market.tokens.find((t) => t.outcome === "No");
        if (!yes || !no) {
            throw new Error(`market ${market.id} missing Yes/No tokens`);
        }
        return { yes_token_id: yes.token_id, no_token_id: no.token_id };
    }
}

/**
 * Convert one raw API row into our snake_case shape. Returns null for rows
 * that aren't tradable binary YES/NO markets — the upstream API ignores some
 * filter flags so we re-check here.
 */
function normalise(
    raw: RawGammaMarket,
    event_id: string | null,
    event_slug: string | null,
): GammaMarket | null {
    if (
        !raw.enableOrderBook ||
        !raw.acceptingOrders ||
        raw.closed ||
        raw.archived ||
        !raw.endDate ||
        !raw.clobTokenIds ||
        !raw.outcomes
    ) {
        return null;
    }

    const token_ids = parse_json_string_array(raw.clobTokenIds);
    const outcomes = parse_json_string_array(raw.outcomes);
    if (token_ids.length !== outcomes.length || token_ids.length < 2) {
        return null;
    }

    const tokens: GammaToken[] = [];
    for (let i = 0; i < token_ids.length; i++) {
        const outcome = outcomes[i];
        if (outcome !== "Yes" && outcome !== "No") return null;
        tokens.push({ token_id: token_ids[i]!, outcome });
    }
    if (!tokens.some((t) => t.outcome === "Yes") || !tokens.some((t) => t.outcome === "No")) {
        return null;
    }

    return {
        id: String(raw.id),
        slug: raw.slug ?? "",
        question: raw.question ?? "",
        description: raw.description ?? "",
        end_date_iso: raw.endDate,
        volume_24hr: raw.volume24hr ?? 0,
        liquidity: raw.liquidityNum ?? 0,
        minimum_tick_size: String(raw.orderPriceMinTickSize ?? 0.01),
        neg_risk: raw.negRisk ?? false,
        image_url: raw.image ?? null,
        tokens,
        event_id,
        event_slug,
    };
}

function normalise_comment(raw: RawGammaComment): GammaComment {
    const profile = raw.profile ?? {};
    return {
        id: String(raw.id),
        body: raw.body ?? "",
        parent_comment_id: raw.parentCommentID ?? null,
        user_address: raw.userAddress ?? null,
        created_at: raw.createdAt ?? "",
        reaction_count: raw.reactionCount ?? 0,
        profile: {
            name: profile.name ?? null,
            pseudonym: profile.pseudonym ?? null,
            proxy_wallet: profile.proxyWallet ?? null,
            base_address: profile.baseAddress ?? null,
            profile_image: profile.profileImage ?? null,
            positions: (profile.positions ?? [])
                .filter((p) => p.tokenId && p.positionSize)
                .map((p) => ({
                    token_id: String(p.tokenId),
                    position_size: String(p.positionSize),
                })),
        },
        reactions: (raw.reactions ?? []).map((r) => ({
            reaction_type: r.reactionType ?? "",
            user_address: r.userAddress ?? null,
        })),
    };
}

function parse_json_string_array(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((v) => String(v));
    } catch {
        return [];
    }
}

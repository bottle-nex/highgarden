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
    /** Polymarket tag labels (e.g. "Politics", "Crypto"). Always lowercase
     *  duplicates removed; never null — empty array means "no tags". */
    tags: string[];
}

export interface FetchMarketsParams {
    limit?: number;
    offset?: number;
    order?: "volume_24hr" | "liquidity" | "start_date" | "end_date";
    ascending?: boolean;
    /** ISO-8601 lower bound on `endDate`. Use this to filter out zombie
     *  markets that are flagged active but already past their end —
     *  Polymarket leaves them in that state pending operator close. */
    end_date_min?: string;
}

export interface FetchEventsParams {
    limit?: number;
    offset?: number;
    order?: "volume_24hr" | "liquidity" | "start_date" | "end_date";
    ascending?: boolean;
    end_date_min?: string;
}

export type CommentParentEntityType = "Event" | "Series";

export interface FetchCommentsParams {
    parent_entity_type: CommentParentEntityType;
    parent_entity_id: string;
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
interface RawGammaTag {
    id?: string | number;
    label?: string | null;
    slug?: string | null;
}

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
    tags?: RawGammaTag[];
}

interface RawGammaEvent {
    id: string | number;
    slug?: string;
    title?: string;
    markets?: RawGammaMarket[];
    tags?: RawGammaTag[];
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
    /** Ascending by `endDate` surfaces the soonest-to-resolve markets first
     *  — exactly the 5-min ladders the standard volume-ordered discovery
     *  misses. */
    end_date: "endDate",
};

const DEFAULT_GAMMA_URL = "https://gamma-api.polymarket.com";

/**
 * Polymarket flags some binary markets with non-Yes/No outcome labels.
 * The most common are the crypto Up-or-Down ladders ("Up"/"Down") that
 * we want to surface as fast-moving markets. We map them onto our
 * canonical Yes/No so the rest of the stack — orchestrator, on-chain
 * `place_order`, portfolio aggregation — doesn't need to learn new
 * outcome strings.
 *
 *   "Up"     → Yes (price went up, payout on the bullish side)
 *   "Down"   → No  (price went down)
 *   "Higher" → Yes
 *   "Lower"  → No
 */
const BINARY_OUTCOME_ALIASES: Record<string, "Yes" | "No"> = {
    Yes: "Yes",
    No: "No",
    Up: "Yes",
    Down: "No",
    Higher: "Yes",
    Lower: "No",
};

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
        if (params.end_date_min) {
            url.searchParams.set("end_date_min", params.end_date_min);
        }

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaMarket[];
        return raw
            .map((m) => normalise(m, null, null, []))
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
            const event_tags = extract_tag_labels(event.tags);
            for (const m of event.markets ?? []) {
                const normalised = normalise(m, event_id, event_slug, event_tags);
                if (normalised) flattened.push(normalised);
            }
        }
        return flattened;
    }

    async fetch_event_id_for_market(market_id: string): Promise<{
        event_id: string;
        event_slug: string | null;
        tags: string[];
    } | null> {
        const url = new URL("/events", this.base_url);
        url.searchParams.set("related_markets", market_id);
        url.searchParams.set("limit", "1");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma related-events fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaEvent[];
        if (raw.length === 0) return null;
        const first = raw[0];
        if (!first) return null;
        return {
            event_id: String(first.id),
            event_slug: first.slug ?? null,
            tags: extract_tag_labels(first.tags),
        };
    }

    /**
     * Fetch a single event's full payload by id. The `/events?related_markets=`
     * variant returns a stripped response that often only contains a generic
     * "All" tag, so for the backfill / single-event refresh path we hit the
     * canonical id-filtered endpoint which carries the real tag list.
     */
    async fetch_event_by_id(event_id: string): Promise<{
        event_id: string;
        event_slug: string | null;
        tags: string[];
    } | null> {
        const url = new URL("/events", this.base_url);
        url.searchParams.set("id", event_id);
        url.searchParams.set("limit", "1");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma event-by-id fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaEvent[];
        if (raw.length === 0) return null;
        const first = raw[0];
        if (!first) return null;
        return {
            event_id: String(first.id),
            event_slug: first.slug ?? null,
            tags: extract_tag_labels(first.tags),
        };
    }

    async fetch_comments(params: FetchCommentsParams): Promise<GammaComment[]> {
        const url = new URL("/comments", this.base_url);
        url.searchParams.set("parent_entity_type", params.parent_entity_type);
        url.searchParams.set("parent_entity_id", params.parent_entity_id);
        url.searchParams.set("limit", String(params.limit ?? 30));
        url.searchParams.set("offset", String(params.offset ?? 0));
        url.searchParams.set("get_positions", "true");
        url.searchParams.set("get_reports", "true");
        url.searchParams.set("order", "createdAt");
        url.searchParams.set("ascending", "false");
        url.searchParams.set("holders_only", params.holders_only ? "true" : "false");

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma comments fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawGammaComment[];
        return raw.map(normalise_comment);
    }

    /**
     * Polymarket anchors its comments thread on a *Series* (a recurring set
     * of related events) rather than on an individual Event, so a single
     * event by itself often shows almost no comments. This call resolves the
     * series id by fetching the event detail and returning the first entry
     * in its `series` array — `null` when the event is one-off and has no
     * series.
     */
    async fetch_event_series_id(event_id: string): Promise<string | null> {
        const url = new URL(`/events/${event_id}`, this.base_url);
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error(`gamma event detail fetch failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as { series?: Array<{ id: string | number }> };
        const first = raw.series?.[0];
        return first ? String(first.id) : null;
    }

    /**
     * Lightweight status check by ID — returns the raw closed/archived flags
     * without filtering. Used by the pre-trade validator to gate quotes.
     * Quotes get rejected if the underlying Polymarket market is no longer
     * open, before we ever sign a quote we couldn't hedge.
     */
    async fetch_market_status(market_id: string): Promise<{
        closed: boolean;
        archived: boolean;
        active: boolean;
        accepting_orders: boolean;
    } | null> {
        const url = new URL("/markets", this.base_url);
        url.searchParams.set("id", market_id);
        url.searchParams.set("limit", "1");
        const res = await fetch(url);
        if (!res.ok) return null;
        const body = (await res.json()) as RawGammaMarket[] | RawGammaMarket | null;
        if (!body) return null;
        const raw = Array.isArray(body) ? body[0] : body;
        if (!raw) return null;
        return {
            closed: !!raw.closed,
            archived: !!raw.archived,
            active: raw.active !== false,
            accepting_orders: raw.acceptingOrders !== false,
        };
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
    event_tags: string[],
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
        const raw_outcome = outcomes[i];
        const outcome = raw_outcome ? BINARY_OUTCOME_ALIASES[raw_outcome] : undefined;
        // Drop markets with non-binary outcome labels (multi-outcome
        // composites, exotic naming). The alias table keeps the canonical
        // Yes/No plus the Up/Down + Higher/Lower mappings used by
        // Polymarket's crypto fast-moving ladders.
        if (!outcome) return null;
        tokens.push({ token_id: token_ids[i]!, outcome });
    }
    if (!tokens.some((t) => t.outcome === "Yes") || !tokens.some((t) => t.outcome === "No")) {
        return null;
    }

    // Tags can sit on the event (when fetched via /events) or on the market
    // row itself (some /markets responses include them). Merge both so we
    // never drop tags that the upstream put in the less common spot.
    const market_tags = extract_tag_labels(raw.tags);
    const tags = dedupe_strings([...event_tags, ...market_tags]);

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
        tags,
    };
}

function extract_tag_labels(raw_tags: RawGammaTag[] | null | undefined): string[] {
    if (!Array.isArray(raw_tags)) return [];
    const out: string[] = [];
    for (const t of raw_tags) {
        const label = typeof t?.label === "string" ? t.label.trim() : "";
        if (label.length > 0) out.push(label);
    }
    return out;
}

function dedupe_strings(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out;
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

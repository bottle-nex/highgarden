import { prisma } from "@solmarket/database";
import { ListingStatus, type NewsArticleDTO } from "@solmarket/types";
import { ENV } from "../config/config.env";

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const FAVICON_BASE = "https://www.google.com/s2/favicons";
const MAX_ARTICLES = 12;
const CACHE_TTL_MS = 5 * 60_000;
// On failure a market is briefly re-cached so reads don't refetch instantly;
// the circuit breaker (below) owns the longer upstream backoff.
const FAILURE_CACHE_MS = 60_000;
// Circuit-breaker ceiling. Consecutive failed probes back off exponentially
// from FAILURE_CACHE_MS up to this bound.
const MAX_BREAKER_MS = 10 * 60_000;
// Rate-limit the aggregate "upstream failing" warn so a dead endpoint logs at
// most once per window instead of once per market per poll (this per-market
// spam previously filled the disk with 100+ GB of logs).
const FAILURE_LOG_INTERVAL_MS = 5 * 60_000;

interface CacheEntry {
    expires_at: number;
    articles: NewsArticleDTO[];
    /** In-flight promise so concurrent callers share one fetch. */
    in_flight?: Promise<NewsArticleDTO[]>;
}

/**
 * Fetches Google News RSS for approved markets on demand. Mirrors what
 * Polymarket's homepage does — they query the same RSS feed keyed off the
 * event title and surface the redirect URLs as-is.
 *
 * In-memory cache only: news is ephemeral and doesn't merit a DB table. The
 * cache de-dupes concurrent requests for the same market so a dashboard load
 * fans out one RSS hit per market, not N.
 */
export default class NewsService {
    private readonly cache = new Map<string, CacheEntry>();
    // Circuit-breaker state for the upstream (Google News). While the breaker
    // is open we serve cached results without fetching, so a dead upstream
    // isn't hammered once per market every poll.
    private consecutive_failures = 0;
    private breaker_open_until = 0;
    private last_failure_log_at = 0;

    public async news_for_market(market: { id: string; name: string }): Promise<NewsArticleDTO[]> {
        if (!ENV.SERVER_NEWS_ENABLED) return [];

        const now = Date.now();
        const cached = this.cache.get(market.id);

        // Breaker open: serve whatever we have, don't fetch.
        if (now < this.breaker_open_until) return cached?.articles ?? [];

        if (cached) {
            if (cached.in_flight) return cached.in_flight;
            if (cached.expires_at > now) return cached.articles;
        }

        const promise = this.fetch_and_store(market);
        const entry: CacheEntry = {
            expires_at: cached?.expires_at ?? 0,
            articles: cached?.articles ?? [],
            in_flight: promise,
        };
        this.cache.set(market.id, entry);
        return promise;
    }

    /**
     * News for every approved market, merged and sorted by recency. Used by
     * the dashboard's "breaking news" feed. Per-market results come from the
     * same TTL cache so we don't refetch on every dashboard view.
     */
    public async recent_across_approved(limit: number): Promise<NewsArticleDTO[]> {
        if (!ENV.SERVER_NEWS_ENABLED) return [];

        // Breaker open: skip the DB query and per-market fan-out entirely, and
        // serve whatever is still cached from the last good batch.
        if (Date.now() < this.breaker_open_until) {
            return this.merge_and_limit([...this.cache.values()].map((e) => e.articles), limit);
        }

        const approved = await prisma.listing.findMany({
            where: { status: ListingStatus.APPROVED },
            include: { market: { select: { id: true, name: true } } },
        });

        const lists = await Promise.all(
            approved
                .map((l) => l.market)
                .filter((m): m is { id: string; name: string } => m !== null && m !== undefined)
                // news_for_market swallows fetch errors internally (see
                // note_failure), so this .catch only guards unexpected throws.
                .map((m) => this.news_for_market(m).catch(() => [] as NewsArticleDTO[])),
        );

        return this.merge_and_limit(lists, limit);
    }

    /** Flatten per-market article lists, sort by recency, de-dupe by link, cap. */
    private merge_and_limit(lists: NewsArticleDTO[][], limit: number): NewsArticleDTO[] {
        const merged = lists.flat();
        merged.sort((a, b) => {
            const ta = a.pubDate ? Date.parse(a.pubDate) : 0;
            const tb = b.pubDate ? Date.parse(b.pubDate) : 0;
            return tb - ta;
        });

        // De-dupe by article link in case two markets share a story.
        const seen = new Set<string>();
        const out: NewsArticleDTO[] = [];
        for (const a of merged) {
            if (seen.has(a.link)) continue;
            seen.add(a.link);
            out.push(a);
            if (out.length >= limit) break;
        }
        return out;
    }

    private async fetch_and_store(market: { id: string; name: string }): Promise<NewsArticleDTO[]> {
        try {
            const items = await this.fetch_rss(this.build_query(market.name));
            const articles = items.map((it, i) => ({
                id: `${market.id}:${i}`,
                title: it.title,
                link: it.link,
                publicationName: it.publicationName,
                publicationFavicon: it.publicationFavicon,
                pubDate: it.pubDate,
            }));
            this.cache.set(market.id, {
                expires_at: Date.now() + CACHE_TTL_MS,
                articles,
            });
            this.note_success();
            return articles;
        } catch (err) {
            this.note_failure(err);
            // Keep serving the previous good copy if we have one; otherwise
            // cache an empty result briefly so we don't retry on every read.
            const prev = this.cache.get(market.id);
            const fallback = prev?.articles ?? [];
            this.cache.set(market.id, {
                expires_at: Date.now() + FAILURE_CACHE_MS,
                articles: fallback,
            });
            return fallback;
        }
    }

    /** A successful fetch closes the breaker and clears the failure streak. */
    private note_success(): void {
        if (this.consecutive_failures > 0 || this.breaker_open_until > 0) {
            this.consecutive_failures = 0;
            this.breaker_open_until = 0;
        }
    }

    /**
     * Record a fetch failure and (re)open the circuit breaker. Escalates at
     * most once per open window so a whole batch of concurrent failures counts
     * as one probe, and logs a single concise line per FAILURE_LOG_INTERVAL_MS
     * — never the raw error object, which for AbortError is a giant
     * DOMException that used to be dumped once per market per poll.
     */
    private note_failure(err: unknown): void {
        const now = Date.now();
        // Already backing off — don't double-count the rest of the batch.
        if (now < this.breaker_open_until) return;

        this.consecutive_failures++;
        const backoff = Math.min(
            MAX_BREAKER_MS,
            FAILURE_CACHE_MS * 2 ** Math.min(this.consecutive_failures - 1, 8),
        );
        this.breaker_open_until = now + backoff;

        if (now - this.last_failure_log_at > FAILURE_LOG_INTERVAL_MS) {
            this.last_failure_log_at = now;
            const reason =
                err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            console.warn(
                `[news] upstream fetch failing (${reason}); backing off ${Math.round(backoff / 1000)}s`,
            );
        }
    }

    private build_query(name: string): string {
        return name.replace(/\?+$/g, "").trim();
    }

    private async fetch_rss(query: string): Promise<RawItem[]> {
        const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ENV.SERVER_NEWS_FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { "user-agent": "Mozilla/5.0 (solmarket-news/1.0)" },
            });
            if (!res.ok) throw new Error(`google news rss: ${res.status}`);
            const xml = await res.text();
            return this.parse_rss(xml).slice(0, MAX_ARTICLES);
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Minimal RSS 2.0 parser tuned to Google News's output. Each <item> has
     * <title>, <link>, <pubDate>, and <source url="...">Publisher</source>.
     * Google's titles look like "Headline - Publisher" so we strip the
     * trailing publisher when <source> is present.
     */
    private parse_rss(xml: string): RawItem[] {
        const items: RawItem[] = [];
        const item_re = /<item>([\s\S]*?)<\/item>/g;
        let m: RegExpExecArray | null;
        while ((m = item_re.exec(xml)) !== null) {
            const block = m[1];
            if (!block) continue;
            const raw_title = this.tag(block, "title") ?? "";
            const link = this.tag(block, "link") ?? "";
            if (!link) continue;
            const pub_date_raw = this.tag(block, "pubDate");
            const source_match = block.match(/<source\s+url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
            const publication_name = source_match
                ? this.unescape(source_match[2] ?? "").trim() || null
                : this.derive_publisher_from_title(raw_title);
            const publication_url = source_match?.[1] ?? null;
            const publication_favicon = publication_url ? this.favicon_for(publication_url) : null;
            const title = this.strip_publisher_suffix(raw_title, publication_name);

            items.push({
                title,
                link,
                publicationName: publication_name,
                publicationFavicon: publication_favicon,
                pubDate: pub_date_raw ? this.safe_iso(pub_date_raw) : null,
            });
        }
        return items;
    }

    private tag(block: string, name: string): string | null {
        const re = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i");
        const match = block.match(re);
        if (!match) return null;
        return this.unescape(match[1] ?? "").trim();
    }

    private unescape(s: string): string {
        return s
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'");
    }

    private derive_publisher_from_title(title: string): string | null {
        const idx = title.lastIndexOf(" - ");
        if (idx < 0) return null;
        return title.slice(idx + 3).trim() || null;
    }

    private strip_publisher_suffix(title: string, publisher: string | null): string {
        if (!publisher) return title;
        const suffix = ` - ${publisher}`;
        return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
    }

    private favicon_for(publication_url: string): string | null {
        try {
            const host = new URL(publication_url).hostname;
            return `${FAVICON_BASE}?domain=${encodeURIComponent(host)}&sz=64`;
        } catch {
            return null;
        }
    }

    private safe_iso(s: string): string | null {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
}

interface RawItem {
    title: string;
    link: string;
    publicationName: string | null;
    publicationFavicon: string | null;
    pubDate: string | null;
}

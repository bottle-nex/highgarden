import { prisma } from "@solmarket/database";
import { ListingStatus, type NewsArticleDTO } from "@solmarket/types";

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const FAVICON_BASE = "https://www.google.com/s2/favicons";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ARTICLES = 12;
const CACHE_TTL_MS = 5 * 60_000;

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

    public async news_for_market(market: { id: string; name: string }): Promise<NewsArticleDTO[]> {
        const now = Date.now();
        const cached = this.cache.get(market.id);
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
        const approved = await prisma.listing.findMany({
            where: { status: ListingStatus.APPROVED },
            include: { market: { select: { id: true, name: true } } },
        });

        const lists = await Promise.all(
            approved
                .map((l) => l.market)
                .filter((m): m is { id: string; name: string } => m !== null && m !== undefined)
                .map((m) =>
                    this.news_for_market(m).catch((err) => {
                        console.error(`[news] fetch failed for ${m.id}:`, err);
                        return [] as NewsArticleDTO[];
                    }),
                ),
        );

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
            return articles;
        } catch (err) {
            console.error(`[news] fetch failed for ${market.id}:`, err);
            // Keep serving the previous good copy if we have one; otherwise
            // cache an empty result briefly so we don't retry on every read.
            const prev = this.cache.get(market.id);
            const fallback = prev?.articles ?? [];
            this.cache.set(market.id, {
                expires_at: Date.now() + 60_000,
                articles: fallback,
            });
            return fallback;
        }
    }

    private build_query(name: string): string {
        return name.replace(/\?+$/g, "").trim();
    }

    private async fetch_rss(query: string): Promise<RawItem[]> {
        const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

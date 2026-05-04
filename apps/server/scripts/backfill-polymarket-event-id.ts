import { prisma } from "@solmarket/database";
import { GammaClient } from "../polymarket/gamma";

const RATE_LIMIT_DELAY_MS = 200;

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const gamma = new GammaClient();
    // Backfill rows missing eventId OR with empty tags OR with the degraded
    // ["All"] tag list that the related-markets Gamma endpoint returns. We
    // overwrite degraded-only tag lists once we fetch real ones.
    const rows = await prisma.polyMarket.findMany({
        where: {
            OR: [{ eventId: null }, { tags: { isEmpty: true } }, { tags: { equals: ["All"] } }],
        },
        select: { id: true, eventId: true, tags: true },
    });

    console.log(`[backfill] ${rows.length} PolyMarket rows need eventId or tag refresh`);

    let updated = 0;
    let not_found = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            // Resolve eventId first (only via related-markets — it's the only
            // way for rows that have never seen an event_id). For tags use the
            // canonical id-filtered events endpoint, which carries the full
            // tag list.
            let event_id = row.eventId;
            let event_slug: string | null = null;
            if (!event_id) {
                const related = await gamma.fetch_event_id_for_market(row.id);
                if (!related) {
                    not_found++;
                    console.warn(`[backfill] no event found for polyMarketId=${row.id}`);
                    await sleep(RATE_LIMIT_DELAY_MS);
                    continue;
                }
                event_id = related.event_id;
                event_slug = related.event_slug;
            }

            const full = await gamma.fetch_event_by_id(event_id);
            const tags = full?.tags ?? [];
            if (!event_slug && full) event_slug = full.event_slug;

            const data: Record<string, unknown> = {};
            if (!row.eventId) {
                data.eventId = event_id;
                data.eventSlug = event_slug;
            }
            const has_real_tags = tags.length > 0 && !is_degraded_tags(tags);
            const row_is_degraded = row.tags.length === 0 || is_degraded_tags(row.tags);
            if (has_real_tags && row_is_degraded) {
                data.tags = tags;
            }
            if (Object.keys(data).length === 0) continue;
            await prisma.polyMarket.update({
                where: { id: row.id },
                data,
            });
            updated++;
        } catch (err) {
            failed++;
            console.error(`[backfill] failed for polyMarketId=${row.id}:`, err);
        }
        await sleep(RATE_LIMIT_DELAY_MS);
    }

    console.log(`[backfill] done: updated=${updated} not_found=${not_found} failed=${failed}`);
    await prisma.$disconnect();
}

/** "All" alone is the placeholder Gamma returns from the related-markets path
 *  when it doesn't want to surface real category tags. Treat it as empty. */
function is_degraded_tags(tags: string[]): boolean {
    return tags.length === 1 && tags[0] === "All";
}

main().catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
});

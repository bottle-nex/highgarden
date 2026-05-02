import { prisma } from "@solmarket/database";
import { GammaClient } from "../polymarket/gamma";

const RATE_LIMIT_DELAY_MS = 200;

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const gamma = new GammaClient();
    const rows = await prisma.polyMarket.findMany({
        where: { eventId: null },
        select: { id: true },
    });

    console.log(`[backfill] ${rows.length} PolyMarket rows missing eventId`);

    let updated = 0;
    let not_found = 0;
    let failed = 0;

    for (const row of rows) {
        try {
            const result = await gamma.fetch_event_id_for_market(row.id);
            if (!result) {
                not_found++;
                console.warn(`[backfill] no event found for polyMarketId=${row.id}`);
            } else {
                await prisma.polyMarket.update({
                    where: { id: row.id },
                    data: {
                        eventId: result.event_id,
                        eventSlug: result.event_slug,
                    },
                });
                updated++;
            }
        } catch (err) {
            failed++;
            console.error(`[backfill] failed for polyMarketId=${row.id}:`, err);
        }
        await sleep(RATE_LIMIT_DELAY_MS);
    }

    console.log(
        `[backfill] done: updated=${updated} not_found=${not_found} failed=${failed}`,
    );
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exit(1);
});

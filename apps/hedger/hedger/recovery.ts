import { prisma } from "@solmarket/database";
import LoggerFactory from "../log/logger";
import EventRepo from "../db/event.repo";

export default class BootRecovery {
  private readonly log = LoggerFactory.for_category("recovery");
  private readonly events = new EventRepo();

  public async run(): Promise<void> {
    this.log.info("starting boot recovery");
    await this.recover_stuck_hedging();
    await this.rebuild_exposure_drift_check();
    this.log.info("boot recovery complete");
  }

  private async recover_stuck_hedging(): Promise<void> {
    const stuck = await prisma.hedge.findMany({
      where: { status: "HEDGING" },
      select: { id: true, fillId: true, clientOrderId: true, attempts: true },
    });
    if (stuck.length === 0) return;

    this.log.warn({ count: stuck.length }, "found hedges stuck in HEDGING from a prior crash");
    for (const row of stuck) {
      await this.handle_stuck_row(row);
    }
  }

  private async handle_stuck_row(row: {
    id: string;
    fillId: string;
    clientOrderId: string | null;
    attempts: number;
  }): Promise<void> {
    await prisma.hedge.update({
      where: { id: row.id },
      data: { status: "PENDING" },
    });
    await this.events.record({
      level: "WARN",
      category: "recovery",
      message: "reset stuck HEDGING row to PENDING; BullMQ will retry",
      payload: {
        hedgeId: row.id,
        fillId: row.fillId,
        clientOrderId: row.clientOrderId,
        priorAttempts: row.attempts,
      },
    });
  }

  private async rebuild_exposure_drift_check(): Promise<void> {
    const expected = await this.compute_expected_exposure();
    const exposures = await prisma.exposure.findMany();
    for (const ex of exposures) {
      await this.reconcile_one_exposure(ex, expected.get(ex.marketId) ?? 0);
    }
  }

  private async compute_expected_exposure(): Promise<Map<string, number>> {
    const fills = await prisma.fill.findMany({
      select: {
        marketId: true,
        size: true,
        hedge: { select: { status: true } },
      },
    });
    const expected = new Map<string, number>();
    for (const f of fills) {
      if (this.is_hedge_terminal(f.hedge?.status)) continue;
      expected.set(f.marketId, (expected.get(f.marketId) ?? 0) + f.size);
    }
    return expected;
  }

  private is_hedge_terminal(status: string | null | undefined): boolean {
    return status === "FILLED" || status === "PARTIAL" || status === "FAILED";
  }

  private async reconcile_one_exposure(
    exposure: { marketId: string; unhedgedUsd: number },
    recomputed: number,
  ): Promise<void> {
    if (Math.abs(exposure.unhedgedUsd - recomputed) <= 1) return;
    this.log.warn(
      { marketId: exposure.marketId, stored: exposure.unhedgedUsd, recomputed },
      "exposure drift detected",
    );
    await prisma.exposure.update({
      where: { marketId: exposure.marketId },
      data: { unhedgedUsd: recomputed, lastDecrementAt: new Date() },
    });
    await this.events.record_alert("recovery", "exposure drift corrected", {
      marketId: exposure.marketId,
      stored: exposure.unhedgedUsd,
      recomputed,
    });
  }
}

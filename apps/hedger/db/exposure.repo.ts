import { prisma } from "@solmarket/database";

export interface ExposureRow {
  marketId: string;
  unhedgedUsd: number;
  trackerEnabled: boolean;
  paused: boolean;
}

export default class ExposureRepo {
  public async find(market_id: string): Promise<ExposureRow | null> {
    return prisma.exposure.findUnique({ where: { marketId: market_id } });
  }

  public async ensure(market_id: string): Promise<ExposureRow> {
    return prisma.exposure.upsert({
      where: { marketId: market_id },
      create: { marketId: market_id },
      update: {},
    });
  }

  public async increment(market_id: string, delta_usd: number): Promise<void> {
    await prisma.exposure.upsert({
      where: { marketId: market_id },
      create: {
        marketId: market_id,
        unhedgedUsd: delta_usd,
        lastIncrementAt: new Date(),
      },
      update: {
        unhedgedUsd: { increment: delta_usd },
        lastIncrementAt: new Date(),
      },
    });
  }

  public async decrement(market_id: string, delta_usd: number): Promise<void> {
    await prisma.exposure.update({
      where: { marketId: market_id },
      data: {
        unhedgedUsd: { decrement: delta_usd },
        lastDecrementAt: new Date(),
      },
    });
  }

  public async set_paused(market_id: string, paused: boolean): Promise<void> {
    await prisma.exposure.upsert({
      where: { marketId: market_id },
      create: { marketId: market_id, paused },
      update: { paused },
    });
  }

  public async set_tracker_enabled(market_id: string, enabled: boolean): Promise<void> {
    await prisma.exposure.upsert({
      where: { marketId: market_id },
      create: { marketId: market_id, trackerEnabled: enabled },
      update: { trackerEnabled: enabled },
    });
  }
}

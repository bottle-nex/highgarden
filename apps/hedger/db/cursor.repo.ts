import { prisma } from "@solmarket/database";

const SINGLETON_ID = 1;

export default class CursorRepo {
  public async load(): Promise<{
    lastProcessedSignature: string | null;
    lastProcessedSlot: bigint | null;
    liveStreamConnectedAt: Date | null;
    liveStreamDisconnectedAt: Date | null;
  }> {
    const row = await prisma.botCursor.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });

    return {
      lastProcessedSignature: row.lastProcessedSignature,
      lastProcessedSlot: row.lastProcessedSlot,
      liveStreamConnectedAt: row.liveStreamConnectedAt,
      liveStreamDisconnectedAt: row.liveStreamDisconnectedAt,
    };
  }

  public async record_signature(signature: string, slot: bigint): Promise<void> {
    await prisma.botCursor.update({
      where: { id: SINGLETON_ID },
      data: {
        lastProcessedSignature: signature,
        lastProcessedSlot: slot,
      },
    });
  }

  public async record_live_connected(): Promise<void> {
    await prisma.botCursor.update({
      where: { id: SINGLETON_ID },
      data: {
        liveStreamConnectedAt: new Date(),
        liveStreamDisconnectedAt: null,
      },
    });
  }

  public async record_live_disconnected(): Promise<void> {
    await prisma.botCursor.update({
      where: { id: SINGLETON_ID },
      data: { liveStreamDisconnectedAt: new Date() },
    });
  }

  public async record_poller_run(): Promise<void> {
    await prisma.botCursor.update({
      where: { id: SINGLETON_ID },
      data: { pollerLastRunAt: new Date() },
    });
  }
}

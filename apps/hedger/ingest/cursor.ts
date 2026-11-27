import { prisma } from "@solmarket/database";
import { logger_for } from "../log/log";

const SINGLETON_ID = 1;

/**
 * Wraps the singleton `BotCursor` row that records "where the hedger is
 * on the Solana chain." The poller owns the replay checkpoint, and
 * both ingestion paths record their liveness on the same row.
 *
 * The schema row uses `id Int @default(1)` (one row, ever), so every
 * method targets `id = 1`. v1 and v2 share this row; do not run them
 * concurrently or they'll fight over the cursor.
 */
export default class Cursor {
    private readonly log = logger_for("cursor");
    private slot: bigint | null = null;
    private signature: string | null = null;

    /**
     * Hydrates `slot` and `signature` from `BotCursor` row 1. On a fresh
     * database the row is seeded here with `id = 1` and every other field
     * null; subsequent boots are a no-op read.
     *
     * Must be called once at startup before {@link advance} or any of the
     * `mark_*` methods — those use plain `update` and will throw if the
     * row was never seeded.
     */
    public async load(): Promise<void> {
        const row = await prisma.botCursor.upsert({
            where: { id: SINGLETON_ID },
            update: {},
            create: { id: SINGLETON_ID },
        });
        this.slot = row.lastProcessedSlot;
        this.signature = row.lastProcessedSignature;
        this.log.info(
            { slot: this.slot?.toString() ?? null, sig: this.signature },
            "cursor loaded",
        );
    }

    /** Last slot we successfully processed, or null if nothing has been processed yet. */
    public get_slot(): bigint | null {
        return this.slot;
    }

    /** Last transaction signature we successfully processed, or null if none yet. */
    public get_signature(): string | null {
        return this.signature;
    }

    /**
     * Saves a checkpoint after the poller finishes a transaction. The
     * poller calls this in signature order, so multiple signatures can
     * advance the checkpoint within the same slot. The cached checkpoint
     * changes only after Postgres confirms the write.
     */
    public async advance(slot: bigint, signature: string): Promise<void> {
        if (this.slot !== null && slot < this.slot) return;
        await prisma.botCursor.update({
            where: { id: SINGLETON_ID },
            data: { lastProcessedSlot: slot, lastProcessedSignature: signature },
        });
        this.slot = slot;
        this.signature = signature;
    }

    /**
     * Records that the live websocket subscription just succeeded. Clears
     * `liveStreamDisconnectedAt` in the same write so the row encodes the
     * "currently connected" state atomically — either both timestamps are
     * set (last session ran from connectedAt to disconnectedAt) or only
     * connectedAt is set (currently connected since connectedAt).
     */
    public async mark_live_connected(): Promise<void> {
        await prisma.botCursor.update({
            where: { id: SINGLETON_ID },
            data: { liveStreamConnectedAt: new Date(), liveStreamDisconnectedAt: null },
        });
    }

    /**
     * Records that the live websocket dropped. We deliberately do not
     * clear `liveStreamConnectedAt` here — the connect timestamp marks
     * the start of the previous session and remains as the "from" half of
     * the (from, to) interval the row encodes.
     */
    public async mark_live_disconnected(): Promise<void> {
        await prisma.botCursor.update({
            where: { id: SINGLETON_ID },
            data: { liveStreamDisconnectedAt: new Date() },
        });
    }

    /**
     * Records that the catch-up poller just finished a tick. Used as a
     * liveness signal: if `pollerLastRunAt` is older than the configured
     * interval, the poller is stuck and ops should investigate.
     */
    public async mark_poller_run(): Promise<void> {
        await prisma.botCursor.update({
            where: { id: SINGLETON_ID },
            data: { pollerLastRunAt: new Date() },
        });
    }
}

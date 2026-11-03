import type Redis from "ioredis";
import { sendWithdrawalEmail } from "./service.email";

const OUTBOX = "withdrawal:notifications";
type Receipt = { destination: string; uiAmount: number; txSignature: string };

/** Keep failed email deliveries in Redis and retry them after server restarts. */
export async function notifyWithdrawal(redis: Redis, email: string, receipt: Receipt) {
    await redis.hset(OUTBOX, receipt.txSignature, JSON.stringify({ email, receipt }));
    try {
        await sendWithdrawalEmail(email, receipt);
        await redis.hdel(OUTBOX, receipt.txSignature);
    } catch (error) {
        console.error("[withdrawal-email] queued for retry", error);
    }
}

export function startWithdrawalNotifications(redis: Redis) {
    let running = false;
    const retry = async () => {
        if (running) return;
        running = true;
        try {
            let cursor = "0";
            do {
                const [next, entries] = await redis.hscan(OUTBOX, cursor, "COUNT", 100);
                cursor = next;
                for (let i = 0; i < entries.length; i += 2) {
                    const { email, receipt } = JSON.parse(entries[i + 1]!) as {
                        email: string;
                        receipt: Receipt;
                    };
                    try {
                        await sendWithdrawalEmail(email, receipt);
                        await redis.hdel(OUTBOX, entries[i]!);
                    } catch (error) {
                        console.error("[withdrawal-email] retry failed", error);
                    }
                }
            } while (cursor !== "0");
        } catch (error) {
            console.error("[withdrawal-email] outbox unavailable", error);
        } finally {
            running = false;
        }
    };
    const timer = setInterval(() => void retry(), 60_000);
    timer.unref();
    void retry();
}

import { Queue } from "bullmq";
import { ENV } from "../config/env";
import {
    HEDGE_QUEUE_NAME,
    JOB_NAME_HEDGE,
    JOB_REMOVE_ON_COMPLETE_AGE_SEC,
    JOB_REMOVE_ON_COMPLETE_COUNT,
    JOB_REMOVE_ON_FAIL_AGE_SEC,
    JOB_REMOVE_ON_FAIL_COUNT,
} from "../config/constants";
import LoggerFactory from "../log/logger";
import RedisConnectionFactory from "./connection";
import type { HedgeJobData } from "./types";
import type { OrderFilledEvent } from "../solana/decoder";

export interface EnqueueResult {
    enqueued: boolean;
    jobId: string;
    reason?: "duplicate";
}

export default class HedgeQueueProducer {
    private readonly log = LoggerFactory.for_category("queue");
    private readonly queue: Queue<HedgeJobData>;

    constructor() {
        this.queue = new Queue<HedgeJobData>(HEDGE_QUEUE_NAME, {
            connection: RedisConnectionFactory.get_options(),
            defaultJobOptions: this.default_job_options(),
        });
    }

    public get instance(): Queue<HedgeJobData> {
        return this.queue;
    }

    public async enqueue(
        event: OrderFilledEvent,
        context: { signature: string; slot: number; source: "live" | "poller" | "recovery" },
    ): Promise<EnqueueResult> {
        const job_id = this.job_id_for(event);
        const data = this.build_payload(event, context);

        try {
            const existing = await this.queue.getJob(job_id);
            if (existing) {
                this.log.debug({ jobId: job_id, source: context.source }, "duplicate job");
                return { enqueued: false, jobId: job_id, reason: "duplicate" };
            }

            await this.queue.add(JOB_NAME_HEDGE, data, { jobId: job_id });
            this.log.info(
                { jobId: job_id, source: context.source, market: event.market.toBase58() },
                "enqueued hedge job",
            );
            return { enqueued: true, jobId: job_id };
        } catch (err) {
            this.log.error({ err, jobId: job_id }, "enqueue failed");
            throw err;
        }
    }

    public async close(): Promise<void> {
        await this.queue.close();
    }

    private build_payload(
        event: OrderFilledEvent,
        context: { signature: string; slot: number; source: "live" | "poller" | "recovery" },
    ): HedgeJobData {
        return {
            event: {
                user: event.user.toBase58(),
                market: event.market.toBase58(),
                polymarketMarketId: event.polymarketMarketId,
                side: event.side,
                outcome: event.outcome,
                size: event.size.toString(),
                price: event.price,
                nonceHex: event.nonce.toString("hex"),
            },
            source: context.source,
            signature: context.signature,
            slot: context.slot,
            enqueuedAt: Date.now(),
        };
    }

    private job_id_for(event: OrderFilledEvent): string {
        return event.nonce.toString("hex");
    }

    private default_job_options() {
        return {
            attempts: ENV.HEDGER_JOB_ATTEMPTS,
            backoff: {
                type: "exponential" as const,
                delay: ENV.HEDGER_JOB_BACKOFF_DELAY_MS,
            },
            removeOnComplete: {
                age: JOB_REMOVE_ON_COMPLETE_AGE_SEC,
                count: JOB_REMOVE_ON_COMPLETE_COUNT,
            },
            removeOnFail: {
                age: JOB_REMOVE_ON_FAIL_AGE_SEC,
                count: JOB_REMOVE_ON_FAIL_COUNT,
            },
        };
    }
}

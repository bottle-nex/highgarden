import { QueueEvents } from "bullmq";
import { HEDGE_QUEUE_NAME } from "../config/constants";
import LoggerFactory from "../log/logger";
import RedisConnectionFactory from "./connection";
import EventRepo from "../db/event.repo";

export type OnJobFailed = (_jobId: string, _reason: string) => Promise<void> | void;

export default class HedgeQueueEvents {
    private readonly log = LoggerFactory.for_category("queue-events");
    private readonly queue_events: QueueEvents;
    private readonly events: EventRepo;
    private readonly on_failed: OnJobFailed | null;

    constructor(on_failed?: OnJobFailed) {
        this.queue_events = new QueueEvents(HEDGE_QUEUE_NAME, {
            connection: RedisConnectionFactory.get_options(),
        });
        this.events = new EventRepo();
        this.on_failed = on_failed ?? null;
        this.attach_listeners();
    }

    public async close(): Promise<void> {
        await this.queue_events.close();
    }

    private attach_listeners(): void {
        this.queue_events.on("failed", (args) => {
            void this.handle_failed(args.jobId, args.failedReason);
        });

        this.queue_events.on("stalled", ({ jobId }) => {
            this.log.warn({ jobId }, "job stalled");
        });

        this.queue_events.on("completed", ({ jobId }) => {
            this.log.debug({ jobId }, "job completed (queue-events)");
        });
    }

    private async handle_failed(job_id: string, reason: string): Promise<void> {
        this.log.error({ jobId: job_id, reason }, "final job failure");
        await this.persist_failure(job_id, reason);
        if (this.on_failed) {
            try {
                await this.on_failed(job_id, reason);
            } catch (err) {
                this.log.error({ err, jobId: job_id }, "on_failed callback threw");
            }
        }
    }

    private async persist_failure(job_id: string, reason: string): Promise<void> {
        try {
            await this.events.record_alert("queue", "hedge job exhausted retries", {
                jobId: job_id,
                reason,
            });
        } catch (err) {
            this.log.error({ err, jobId: job_id }, "persist_failure threw");
        }
    }
}

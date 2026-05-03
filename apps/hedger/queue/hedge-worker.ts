import { Worker, type Job } from "bullmq";
import { ENV } from "../config/env";
import { HEDGE_QUEUE_NAME } from "../config/constants";
import LoggerFactory from "../log/logger";
import RedisConnectionFactory from "./connection";
import type { HedgeJobData, HedgeJobResult } from "./types";

export type HedgeJobProcessor = (_job: Job<HedgeJobData>) => Promise<HedgeJobResult>;

export default class HedgeWorker {
    private readonly log = LoggerFactory.for_category("worker");
    private readonly worker: Worker<HedgeJobData, HedgeJobResult>;

    constructor(processor: HedgeJobProcessor) {
        this.worker = new Worker<HedgeJobData, HedgeJobResult>(
            HEDGE_QUEUE_NAME,
            async (job) => processor(job),
            {
                connection: RedisConnectionFactory.get_options(),
                concurrency: ENV.HEDGER_WORKER_CONCURRENCY,
                limiter: {
                    max: ENV.HEDGER_WORKER_RATE_LIMIT_MAX,
                    duration: ENV.HEDGER_WORKER_RATE_LIMIT_MS,
                },
            },
        );

        this.attach_listeners();
    }

    public async close(): Promise<void> {
        await this.worker.close();
    }

    private attach_listeners(): void {
        this.worker.on("ready", () => {
            this.log.info("hedge worker ready");
        });

        this.worker.on("error", (err) => {
            this.log.error({ err }, "worker error");
        });

        this.worker.on("failed", (job, err) => {
            this.log.error(
                { jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message },
                "job failed",
            );
        });

        this.worker.on("completed", (job, result) => {
            this.log.info({ jobId: job.id, result }, "job completed");
        });
    }
}

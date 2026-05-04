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
  private closing = false;

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

  public async close(force = false): Promise<void> {
    this.closing = true;
    await this.worker.close(force);
  }

  private attach_listeners(): void {
    this.worker.on("ready", () => {
      this.log.info("hedge worker ready");
    });

    this.worker.on("error", (err) => {
      if (this.is_shutdown_noise(err)) return;
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

  private is_shutdown_noise(err: unknown): boolean {
    // ETIMEDOUT during shutdown is BullMQ's graceful-close commands
    // racing the socket teardown. Harmless — silence to keep logs clean.
    if (!this.closing) return false;
    const code = (err as { code?: string })?.code;
    return code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ECONNRESET";
  }
}

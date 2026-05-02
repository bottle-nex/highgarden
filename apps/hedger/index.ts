import EnvService from "./config/env";
EnvService.parse_env();

import LoggerFactory from "./log/logger";
import HealthServer from "./health/server";
import CursorRepo from "./db/cursor.repo";
import LiveListener from "./solana/listener";
import CatchUpPoller from "./solana/poller";
import HedgeQueueProducer from "./queue/hedge-queue";
import HedgeWorker from "./queue/hedge-worker";
import HedgeQueueEvents from "./queue/queue-events";
import RedisConnectionFactory from "./queue/connection";
import EventRepo from "./db/event.repo";
import HedgeProcessor from "./hedger/processor";
import BootRecovery from "./hedger/recovery";
import type { OrderFilledEvent } from "./solana/decoder";
import type { HedgeJobData, HedgeJobResult } from "./queue/types";
import type { Job } from "bullmq";

class HedgerApp {
    private readonly log = LoggerFactory.for_category("boot");
    private readonly cursor = new CursorRepo();
    private readonly events = new EventRepo();
    private readonly health = new HealthServer();
    private readonly producer = new HedgeQueueProducer();
    private readonly recovery = new BootRecovery();
    private readonly processor = new HedgeProcessor();
    private listener: LiveListener | null = null;
    private poller: CatchUpPoller | null = null;
    private worker: HedgeWorker | null = null;
    private queue_events: HedgeQueueEvents | null = null;

    public async start(): Promise<void> {
        await this.cursor.load();
        await this.recovery.run();
        await this.start_health();
        await this.start_queue_machinery();
        await this.start_solana_inputs();
        await this.events.record({
            level: "INFO",
            category: "boot",
            message: "hedger started",
        });
        this.log.info("hedger up");
    }

    public async stop(): Promise<void> {
        this.log.info("shutting down");
        await this.listener?.stop();
        this.poller?.stop();
        await this.worker?.close();
        await this.queue_events?.close();
        await this.producer.close();
        await this.health.stop();
        await RedisConnectionFactory.disconnect();
    }

    private async start_health(): Promise<void> {
        this.health.start();
    }

    private async start_queue_machinery(): Promise<void> {
        this.worker = new HedgeWorker(async (job) => this.process_job(job));
        this.queue_events = new HedgeQueueEvents(async (job_id, reason) => {
            await this.on_job_failed(job_id, reason);
        });
    }

    private async start_solana_inputs(): Promise<void> {
        const handler = async (
            event: OrderFilledEvent,
            ctx: { signature: string; slot: number; source: "live" | "poller" },
        ) => {
            this.health.mark_event_seen();
            await this.producer.enqueue(event, ctx);
        };

        this.listener = new LiveListener(handler, this.cursor);
        this.poller = new CatchUpPoller(handler, this.cursor);

        await this.listener.start();
        this.health.mark_live_connected(true);
        this.poller.start();
    }

    private async process_job(job: Job<HedgeJobData>): Promise<HedgeJobResult> {
        return this.processor.handle(job);
    }

    private async on_job_failed(job_id: string, reason: string): Promise<void> {
        this.log.error({ jobId: job_id, reason }, "queue declared job failed");
    }
}

const app = new HedgerApp();

const shutdown = async (signal: string): Promise<void> => {
    LoggerFactory.for_category("boot").info({ signal }, "received shutdown signal");
    await app.stop();
    process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.start();

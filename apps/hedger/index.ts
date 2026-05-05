import EnvService from "./config/env";
EnvService.parse_env();

import { prisma } from "@solmarket/database";
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
import ExposureRepo from "./db/exposure.repo";
import HedgeProcessor from "./hedger/processor";
import BootRecovery from "./hedger/recovery";
import ResolverPoller from "./resolver/poll";
import ReconcileLoop from "./reconcile/loop";
import HedgerAdminServer from "./admin/server";
import HedgerAdminTxSubmitter from "./solana/admin-tx";
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
  private readonly resolver = new ResolverPoller();
  private readonly reconcile = new ReconcileLoop();
  private readonly admin = new HedgerAdminServer({ producer: this.producer });
  private readonly admin_tx = new HedgerAdminTxSubmitter();
  private readonly exposure = new ExposureRepo();
  private listener: LiveListener | null = null;
  private poller: CatchUpPoller | null = null;
  private worker: HedgeWorker | null = null;
  private queue_events: HedgeQueueEvents | null = null;
  private warned_pause_disabled = false;

  public async start(): Promise<void> {
    await this.cursor.load();
    await this.recovery.run();
    await this.start_health();
    await this.start_queue_machinery();
    await this.start_solana_inputs();
    this.resolver.start();
    this.reconcile.start();
    this.admin.start();
    await this.events.record({
      level: "INFO",
      category: "boot",
      message: "hedger started",
    });
    this.log.info("hedger up");
  }

  public async stop(): Promise<void> {
    this.log.info("shutting down");
    this.resolver.stop();
    this.reconcile.stop();
    await this.with_timeout(this.admin.stop(), 1000);
    await this.stop_solana_inputs();
    await this.stop_queue_machinery();
    await this.health.stop();
    await this.with_timeout(RedisConnectionFactory.disconnect(), 1000);
  }

  private async stop_solana_inputs(): Promise<void> {
    await this.with_timeout(this.listener?.stop() ?? Promise.resolve(), 1000);
    this.poller?.stop();
  }

  private async stop_queue_machinery(): Promise<void> {
    // Force-close BullMQ components — they otherwise wait for in-flight
    // Redis commands which can hang indefinitely on shutdown when sockets
    // are torn down. We don't care about graceful drain here; the
    // FSM + boot recovery handles any in-flight job on next start.
    await this.with_timeout(this.worker?.close(true) ?? Promise.resolve(), 1500);
    await this.with_timeout(this.queue_events?.close() ?? Promise.resolve(), 1000);
    await this.with_timeout(this.producer.close(), 1000);
  }

  private async with_timeout<T>(promise: Promise<T>, ms: number): Promise<void> {
    await Promise.race([
      promise.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    ]);
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
    await this.mark_hedge_failed(job_id, reason);
    await this.maybe_pause_market(job_id, reason);
  }

  private async mark_hedge_failed(job_id: string, reason: string): Promise<void> {
    try {
      const hedge = await prisma.hedge.findUnique({ where: { bullJobId: job_id } });
      if (!hedge) return;
      if (hedge.status === "FAILED") return;
      await prisma.hedge.update({
        where: { id: hedge.id },
        data: { status: "FAILED", lastError: reason, completedAt: new Date() },
      });
    } catch (err) {
      this.log.error({ err, jobId: job_id }, "mark_hedge_failed threw");
    }
  }

  private async maybe_pause_market(job_id: string, reason: string): Promise<void> {
    if (!this.admin_tx.is_configured()) {
      if (!this.warned_pause_disabled) {
        this.log.warn(
          "auto-pause disabled — set HEDGER_SOLANA_ADMIN_KEYPAIR to enable pausing markets after permanent hedge failures",
        );
        this.warned_pause_disabled = true;
      }
      return;
    }
    try {
      const ctx = await this.lookup_pause_context(job_id);
      if (!ctx) return;
      const sig = await this.admin_tx.pause_market(ctx.solanaMarketPda);
      await this.exposure.set_paused(ctx.marketId, true);
      this.log.warn(
        { jobId: job_id, marketId: ctx.marketId, marketPda: ctx.solanaMarketPda, txSig: sig },
        ">>> AUTO-PAUSE: market paused after permanent job failure",
      );
      await this.events.record_alert("queue", "market auto-paused after job failure", {
        jobId: job_id,
        marketId: ctx.marketId,
        marketPda: ctx.solanaMarketPda,
        reason,
        pauseTxSig: sig,
      });
    } catch (err) {
      this.log.error({ err, jobId: job_id }, "auto-pause failed");
    }
  }

  private async lookup_pause_context(
    job_id: string,
  ): Promise<{ marketId: string; solanaMarketPda: string } | null> {
    const hedge = await prisma.hedge.findUnique({
      where: { bullJobId: job_id },
      include: { fill: { include: { market: true } } },
    });
    const market = hedge?.fill?.market;
    if (!market?.solanaMarketPda) {
      this.log.warn({ jobId: job_id }, "could not resolve market PDA for auto-pause");
      return null;
    }
    return { marketId: market.id, solanaMarketPda: market.solanaMarketPda };
  }
}

const app = new HedgerApp();

let shutting_down = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shutting_down) {
    // Second Ctrl+C — caller wants out NOW. Don't wait for graceful close.
    process.exit(1);
  }
  shutting_down = true;
  LoggerFactory.for_category("boot").info({ signal }, "received shutdown signal");

  // Hard timeout: if graceful stop hasn't finished within 4s, exit anyway.
  // Prevents the process from hanging due to ioredis sockets that won't drain.
  const hard_timeout = setTimeout(() => {
    LoggerFactory.for_category("boot").warn("graceful shutdown exceeded 4s budget — forcing exit");
    process.exit(0);
  }, 4000);

  try {
    await app.stop();
  } finally {
    clearTimeout(hard_timeout);
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.start();

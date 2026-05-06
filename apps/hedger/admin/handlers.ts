import { prisma } from "@solmarket/database";
import LoggerFactory from "../log/logger";
import EventRepo from "../db/event.repo";
import ResolverStateRepo from "../db/resolver-state.repo";
import ExposureRepo from "../db/exposure.repo";
import SolanaResolutionSubmitter from "../resolver/submit-solana";
import PolymarketRedeemer from "../polymarket/redeem";
import HedgeQueueProducer from "../queue/hedge-queue";

export interface AdminDeps {
  producer: HedgeQueueProducer;
}

export default class AdminHandlers {
  private readonly log = LoggerFactory.for_category("admin");
  private readonly events = new EventRepo();
  private readonly resolver_state = new ResolverStateRepo();
  private readonly exposure = new ExposureRepo();
  private readonly submitter = new SolanaResolutionSubmitter();
  private readonly redeemer = new PolymarketRedeemer();
  private readonly producer: HedgeQueueProducer;

  constructor(deps: AdminDeps) {
    this.producer = deps.producer;
  }

  public async status(): Promise<Response> {
    const cursor = await prisma.botCursor.findUnique({ where: { id: 1 } });
    const counts = await this.collect_counts();
    return Response.json({
      ok: true,
      cursor: cursor && {
        lastProcessedSignature: cursor.lastProcessedSignature,
        liveStreamConnectedAt: cursor.liveStreamConnectedAt?.toISOString() ?? null,
        pollerLastRunAt: cursor.pollerLastRunAt?.toISOString() ?? null,
      },
      counts,
      configured: {
        oracleSigner: this.submitter.is_configured(),
        polygonRedeem: this.redeemer.is_configured(),
      },
    });
  }

  public async list_resolver(): Promise<Response> {
    const rows = await prisma.resolverState.findMany({
      orderBy: { updatedAt: "desc" },
    });
    const market_ids = rows.map((r) => r.marketId);
    const markets =
      market_ids.length === 0
        ? []
        : await prisma.market.findMany({
            where: { id: { in: market_ids } },
            select: { id: true, name: true, polyMarketId: true, solanaMarketPda: true },
          });
    const market_map = new Map(markets.map((m) => [m.id, m]));
    return Response.json({
      ok: true,
      rows: rows.map((r) => ({
        ...r,
        polymarketResolvedAt: r.polymarketResolvedAt?.toISOString() ?? null,
        solanaResolvedAt: r.solanaResolvedAt?.toISOString() ?? null,
        polymarketRedeemedAt: r.polymarketRedeemedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
        market: market_map.get(r.marketId) ?? null,
      })),
    });
  }

  public async force_solana_resolve(market_id: string): Promise<Response> {
    const row = await this.resolver_state.find(market_id);
    if (!row) return json_error("RESOLVER_STATE_NOT_FOUND", 404);
    if (!row.winningOutcome) {
      return json_error("NO_WINNING_OUTCOME_RECORDED", 409);
    }
    if (row.solanaResolveTxSig) {
      return json_error("ALREADY_RESOLVED_ON_SOLANA", 409);
    }
    if (!this.submitter.is_configured()) {
      return json_error("ORACLE_SIGNER_NOT_CONFIGURED", 503);
    }

    const market = await prisma.market.findUnique({
      where: { id: market_id },
      select: { solanaMarketPda: true },
    });
    if (!market?.solanaMarketPda) return json_error("MARKET_NOT_LISTED_ON_SOLANA", 409);

    const result = await this.submitter.submit({
      marketPda: market.solanaMarketPda,
      winningOutcome: row.winningOutcome,
    });
    await this.resolver_state.record_solana_resolved(
      market_id,
      result.signature,
      result.submittedAt,
    );
    await this.events.record({
      level: "WARN",
      category: "admin",
      message: "force_solana_resolve invoked (dispute window bypassed)",
      payload: { marketId: market_id, txSig: result.signature },
    });
    return Response.json({ ok: true, txSignature: result.signature });
  }

  public async retry_redeem(market_id: string): Promise<Response> {
    const row = await this.resolver_state.find(market_id);
    if (!row) return json_error("RESOLVER_STATE_NOT_FOUND", 404);
    if (row.polymarketRedeemTxHash) return json_error("ALREADY_REDEEMED", 409);
    if (!this.redeemer.is_configured()) return json_error("REDEEMER_NOT_CONFIGURED", 503);

    const market = await prisma.market.findUnique({
      where: { id: market_id },
      select: { polyMarketId: true },
    });
    if (!market?.polyMarketId) return json_error("MARKET_NOT_FOUND", 404);

    const outcome = await this.redeemer.redeem({ polymarketMarketId: market.polyMarketId });
    if (outcome.kind === "submitted") {
      await this.resolver_state.record_redeemed(market_id, outcome.txHash, new Date());
    } else {
      await this.resolver_state.mark_redeem_skipped(market_id, outcome.kind);
    }
    return Response.json({ ok: true, outcome });
  }

  public async list_exposure(): Promise<Response> {
    const rows = await prisma.exposure.findMany({ orderBy: { updatedAt: "desc" } });
    return Response.json({
      ok: true,
      rows: rows.map((r) => ({
        ...r,
        lastIncrementAt: r.lastIncrementAt?.toISOString() ?? null,
        lastDecrementAt: r.lastDecrementAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  }

  public async patch_exposure(market_id: string, body: unknown): Promise<Response> {
    const parsed = this.parse_exposure_patch(body);
    if (!parsed.ok) return json_error(parsed.reason, 400);
    await this.exposure.ensure(market_id);
    if (parsed.tracker_enabled !== undefined) {
      await this.exposure.set_tracker_enabled(market_id, parsed.tracker_enabled);
      await this.events.record({
        level: "WARN",
        category: "admin",
        message: `tracker_enabled set to ${parsed.tracker_enabled}`,
        payload: { marketId: market_id },
      });
    }
    if (parsed.paused !== undefined) {
      await this.exposure.set_paused(market_id, parsed.paused);
      await this.events.record({
        level: "WARN",
        category: "admin",
        message: `paused set to ${parsed.paused}`,
        payload: { marketId: market_id },
      });
    }
    const updated = await this.exposure.find(market_id);
    return Response.json({ ok: true, row: updated });
  }

  public async retry_hedge(hedge_id: string): Promise<Response> {
    const hedge = await prisma.hedge.findUnique({ where: { id: hedge_id } });
    if (!hedge) return json_error("HEDGE_NOT_FOUND", 404);
    if (hedge.status !== "FAILED") return json_error("HEDGE_NOT_IN_FAILED_STATE", 409);
    if (!hedge.bullJobId) return json_error("HEDGE_HAS_NO_JOB_ID", 409);

    const job = await this.producer.instance.getJob(hedge.bullJobId);
    if (!job) return json_error("JOB_NOT_FOUND_IN_QUEUE", 404);

    await job.retry("failed");
    await prisma.hedge.update({
      where: { id: hedge.id },
      data: { status: "PENDING", lastError: null },
    });
    this.log.info({ hedgeId: hedge.id, jobId: hedge.bullJobId }, "hedge retry triggered");
    await this.events.record({
      level: "WARN",
      category: "admin",
      message: "hedge retry triggered",
      payload: { hedgeId: hedge.id, jobId: hedge.bullJobId },
    });
    return Response.json({ ok: true, hedgeId: hedge.id });
  }

  private parse_exposure_patch(
    body: unknown,
  ): { ok: true; tracker_enabled?: boolean; paused?: boolean } | { ok: false; reason: string } {
    if (typeof body !== "object" || body === null) {
      return { ok: false, reason: "BODY_MUST_BE_OBJECT" };
    }
    const b = body as { trackerEnabled?: unknown; paused?: unknown };
    const out: { ok: true; tracker_enabled?: boolean; paused?: boolean } = { ok: true };
    if (b.trackerEnabled !== undefined) {
      if (typeof b.trackerEnabled !== "boolean") {
        return { ok: false, reason: "TRACKER_ENABLED_MUST_BE_BOOLEAN" };
      }
      out.tracker_enabled = b.trackerEnabled;
    }
    if (b.paused !== undefined) {
      if (typeof b.paused !== "boolean") {
        return { ok: false, reason: "PAUSED_MUST_BE_BOOLEAN" };
      }
      out.paused = b.paused;
    }
    if (out.tracker_enabled === undefined && out.paused === undefined) {
      return { ok: false, reason: "NO_FIELDS_TO_UPDATE" };
    }
    return out;
  }

  private async collect_counts(): Promise<Record<string, number>> {
    const [fills, hedges_failed, hedges_pending, resolver_pending, resolver_redeemed] =
      await Promise.all([
        prisma.fill.count(),
        prisma.hedge.count({ where: { status: "FAILED" } }),
        prisma.hedge.count({ where: { status: "PENDING" } }),
        prisma.resolverState.count({ where: { stage: "PENDING" } }),
        prisma.resolverState.count({ where: { stage: "REDEEMED" } }),
      ]);
    return { fills, hedges_failed, hedges_pending, resolver_pending, resolver_redeemed };
  }
}

function json_error(code: string, status: number): Response {
  return Response.json({ ok: false, error: code }, { status });
}

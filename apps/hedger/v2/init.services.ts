import SolanaClient from "./clients/solana";
import PolymarketClient from "./clients/polymarket";
import UserRepo from "./repos/user";
import MarketRepo from "./repos/market";
import HedgeRepo from "./repos/hedge";
import FillIngester from "./ingest";
import Hedger from "./hedger";
import Resolver from "./resolver";
import Reconciler from "./reconcile";
import HealthServer from "./health";
import { logger_for } from "./log/log";

/**
 * Every long-lived class instance the hedger uses. Held by reference
 * here so {@link start_services} and {@link stop_services} (and tests)
 * can address them by name without re-constructing.
 *
 * `readonly` on every field is deliberate: once `init_services` returns
 * the graph, nothing should swap a service out at runtime — that would
 * break the dependency arrows wired in here.
 */
export interface Services {
  readonly solana: SolanaClient;
  readonly poly: PolymarketClient;
  readonly users: UserRepo;
  readonly markets: MarketRepo;
  readonly hedges: HedgeRepo;
  readonly hedger: Hedger;
  readonly ingester: FillIngester;
  readonly resolver: Resolver;
  readonly reconciler: Reconciler;
  readonly health: HealthServer;
}

/**
 * Constructs the v2 dependency graph in topological order. Pure
 * function: does not start timers, open connections, or touch the
 * network. The returned graph is dormant until {@link start_services}
 * is called.
 *
 * Call order is enforced by constructor signatures — every class takes
 * its collaborators by argument, no static factories or globals — so
 * a misordered build won't compile. The order below is therefore
 * informative, not load-bearing:
 *
 *   1. Stateless external clients (Solana RPC, Polymarket facade).
 *   2. Repos — depend only on the global Prisma client.
 *   3. HealthServer — no upward deps; constructed early so the
 *      ingester can take a reference.
 *   4. Hedger — depends on clients + repos. Built before the ingester
 *      so the ingester's `on_fill` callback can close over
 *      `hedger.on_fill`.
 *   5. FillIngester — top-level service, fed by the chain.
 *   6. Resolver / Reconciler — independent loops that only read from
 *      Polymarket + DB; they don't drive the hedger directly except
 *      via the reconciler's future re-enqueue path.
 */
export function init_services(): Services {
  const log = logger_for("init");
  log.info("constructing services");

  const solana = new SolanaClient();
  const poly = new PolymarketClient();

  const users = new UserRepo();
  const markets = new MarketRepo();
  const hedges = new HedgeRepo();

  const health = new HealthServer();

  const hedger = new Hedger(solana, poly, hedges, markets, users);
  const ingester = new FillIngester(
    solana,
    (ev, ctx) => hedger.on_fill(ev, ctx),
    health,
  );
  const resolver = new Resolver(solana, poly, markets, hedges);
  const reconciler = new Reconciler(hedger, poly, markets, hedges);

  return {
    solana,
    poly,
    users,
    markets,
    hedges,
    hedger,
    ingester,
    resolver,
    reconciler,
    health,
  };
}

/**
 * Brings every service online in dependency order:
 *
 *   1. Hedger first — its boot recovery completes any in-flight hedge
 *      from a previous crash before new fills are accepted.
 *   2. Ingester second — once `Hedger.start()` returns, fills can
 *      safely flow through `hedger.on_fill`.
 *   3. Resolver / Reconciler — independent timer loops; safe to start
 *      last because they don't enqueue work for the hedger.
 *   4. Health server — exposes `/healthz` for the orchestrator.
 *
 * Throws on the first error; the caller (index.ts) is responsible for
 * propagating to a non-zero exit. Partial-up state is acceptable
 * because the next start will re-run boot recovery.
 */
export async function start_services(s: Services): Promise<void> {
  await s.hedger.start();
  await s.ingester.start();
  s.resolver.start();
  s.reconciler.start();
  s.health.start();
}

/**
 * Shuts down in reverse dependency order, best-effort:
 *
 *   1. Stop the timer loops (resolver, reconciler) so they cannot
 *      enqueue new work on Hedger.
 *   2. Stop the ingester so no new fills arrive.
 *   3. Stop the hedger — its worker is force-closed; in-flight jobs
 *      will be picked up by boot recovery on next start.
 *   4. Stop the health endpoint.
 *
 * Each step is independently `try`-wrapped: a failure in one service's
 * stop must not prevent the others from shutting down. The hard
 * timeout in `index.ts` is the final safety net if any individual
 * step hangs.
 */
export async function stop_services(s: Services): Promise<void> {
  const log = logger_for("init");
  const safe = async (label: string, fn: () => Promise<void> | void): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      log.error({ err, label }, "stop step failed");
    }
  };
  await safe("resolver", () => s.resolver.stop());
  await safe("reconciler", () => s.reconciler.stop());
  await safe("ingester", () => s.ingester.stop());
  await safe("hedger", () => s.hedger.stop());
  await safe("health", () => s.health.stop());
}

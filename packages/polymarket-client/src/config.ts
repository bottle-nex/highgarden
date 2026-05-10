/**
 * Configuration injected at construction time. Each consumer (apps/hedger,
 * apps/server) reads its own env namespace and builds one of these.
 */

export interface PolymarketClientConfig {
  /** REST host, e.g. https://clob.polymarket.com */
  restUrl: string;

  /** Gamma API host, e.g. https://gamma-api.polymarket.com */
  gammaUrl: string;

  // ---- CLOB credentials (all required for non-dry-run trading) ----
  privateKey?: string;
  funderAddress?: string;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;

  // ---- Polygon RPC (required for redemption only) ----
  polygonRpcUrl?: string;

  /** Optional logger. Falls back to a no-op so the package never throws on
   *  missing log infrastructure. Pino loggers satisfy this shape directly. */
  logger?: LoggerLike;
}

/**
 * Minimal logger surface. Compatible with pino, console, and our own
 * logger_for() helpers. Intentionally narrow so we don't lock callers into a
 * specific logging library.
 */
export interface LoggerLike {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export type LogFn = (obj: unknown, msg?: string) => void;

export const noop_logger: LoggerLike = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

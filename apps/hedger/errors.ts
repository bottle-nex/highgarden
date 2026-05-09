/**
 * Re-export shared error classes from the polymarket-client package so the
 * hedger keeps its current import path (`../errors`) while the canonical
 * definition lives in one place. Cross-app callers (apps/server) that want
 * the same instanceof checks should import from
 * `@solmarket/polymarket-client` directly.
 */
export {
  RetryableError,
  UnrecoverableError,
  is_retryable,
} from "@solmarket/polymarket-client";

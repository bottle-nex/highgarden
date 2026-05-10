/**
 * Errors used to drive retry behaviour in callers (BullMQ workers, server
 * orchestrators). Lives here in the shared package so consumers can identify
 * them via instanceof regardless of which app they're called from.
 */

export class RetryableError extends Error {
  public readonly retryable = true;
  public readonly cause_err?: unknown;

  constructor(message: string, cause_err?: unknown) {
    super(message);
    this.cause_err = cause_err;
    this.name = "RetryableError";
  }
}

export class UnrecoverableError extends Error {
  public readonly retryable = false;
  public readonly cause_err?: unknown;

  constructor(message: string, cause_err?: unknown) {
    super(message);
    this.cause_err = cause_err;
    this.name = "UnrecoverableError";
  }
}

export function is_retryable(err: unknown): boolean {
  if (err instanceof RetryableError) return true;
  if (err instanceof UnrecoverableError) return false;
  // Default: unknown errors are retryable. Callers that want strict-retry can
  // narrow further before deciding.
  return true;
}

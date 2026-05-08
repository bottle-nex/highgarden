/**
 * Marks an error as worth retrying. The hedge worker (BullMQ) honors the
 * job's `attempts` config and will reschedule with exponential backoff
 * when a job throws this — used for transient conditions like "user row
 * not yet replicated to the read replica" or "polymarket API timeout".
 *
 * Carries an optional `cause_err` for chaining the originating error
 * without losing the typed-retryable signal.
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

/**
 * Marks an error as terminal — retrying will not help. The worker still
 * records the failure but does not reschedule. Examples: schema mismatch
 * after a contract change, signature failure caused by a bad keypair,
 * "market resolved before we hedged" (the chain has moved on).
 */
export class UnrecoverableError extends Error {
    public readonly retryable = false;
    public readonly cause_err?: unknown;

    constructor(message: string, cause_err?: unknown) {
        super(message);
        this.cause_err = cause_err;
        this.name = "UnrecoverableError";
    }
}

/**
 * Classifies an unknown thrown value into "retry me" or "give up." Used
 * by the worker's failure handler to decide whether to bubble the error
 * back to BullMQ for backoff or to mark the hedge permanently failed.
 *
 * Default — a bare `Error` with no marker — is treated as retryable.
 * That bias is deliberate: we'd rather retry a bug we forgot to classify
 * than silently give up and leave a position unhedged. Move errors into
 * `UnrecoverableError` once you've identified them as terminal.
 */
export function is_retryable(err: unknown): boolean {
    if (err instanceof RetryableError) return true;
    if (err instanceof UnrecoverableError) return false;
    return true;
}

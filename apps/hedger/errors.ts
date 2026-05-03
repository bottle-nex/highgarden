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
    return true;
}

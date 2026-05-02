export class RetryableError extends Error {
    public readonly retryable = true;

    constructor(message: string, public readonly cause_err?: unknown) {
        super(message);
        this.name = "RetryableError";
    }
}

export class UnrecoverableError extends Error {
    public readonly retryable = false;

    constructor(message: string, public readonly cause_err?: unknown) {
        super(message);
        this.name = "UnrecoverableError";
    }
}

export function is_retryable(err: unknown): boolean {
    if (err instanceof RetryableError) return true;
    if (err instanceof UnrecoverableError) return false;
    return true;
}

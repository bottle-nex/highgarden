export class Logger {
    info(message: string, ...args: unknown[]): void {
        console.log(`[info] ${message}`, ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        console.warn(`[warn] ${message}`, ...args);
    }

    error(message: string, ...args: unknown[]): void {
        console.error(`[error] ${message}`, ...args);
    }
}

export const logger = new Logger();

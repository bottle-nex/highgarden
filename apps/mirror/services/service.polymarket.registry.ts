export type AcquireResult = { firstRef: boolean; count: number };
export type ReleaseResult = { lastRef: boolean; count: number };

export default class SubscriptionRegistry {
    private counts = new Map<string, number>();

    public acquire(key: string): AcquireResult {
        const last_count = this.counts.get(key) ?? 0;
        this.counts.set(key, last_count + 1);
        return { firstRef: last_count === 0, count: last_count + 1 };
    }

    public release(key: string): ReleaseResult {
        const prev = this.counts.get(key) ?? 0;
        if (prev <= 0) {
            return { lastRef: false, count: 0 };
        }
        const next = prev - 1;
        if (next === 0) {
            this.counts.delete(key);
            return { lastRef: true, count: 0 };
        }
        this.counts.set(key, next);
        return { lastRef: false, count: next };
    }

    public snapshot(): Array<string> {
        return Array.from(this.counts.keys());
    }

    public has(key: string): boolean {
        return this.counts.has(key);
    }

    public size(): number {
        return this.counts.size;
    }
}

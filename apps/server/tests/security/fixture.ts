import { spyOn, mock } from "bun:test";
import type { PrismaClient } from "@solmarket/database";
const model = () =>
    Object.fromEntries(
        [
            "findUnique",
            "findUniqueOrThrow",
            "findFirst",
            "findMany",
            "create",
            "update",
            "updateMany",
            "upsert",
        ].map((name) => [
            name,
            () => {
                throw new Error("Unmocked database operation");
            },
        ]),
    );
const prisma = {
    user: model(),
    withdrawalIntent: model(),
    notificationOutbox: model(),
    resolverState: model(),
    $queryRaw: () => {},
    $transaction: () => {},
} as unknown as PrismaClient;
mock.module(
    new URL("../../../../packages/database/src/client.ts", import.meta.url).pathname,
    () => ({ prisma }),
);
mock.module("@solmarket/database", () => ({ prisma }));
import EnvService from "../../config/config.env";

Object.assign(process.env, {
    SERVER_REDIS_URL: "redis://localhost:6379",
    SERVER_PORT: "8080",
    SERVER_AUTH_SECRET: "security-test-secret-at-least-32-characters",
    SERVER_RESEND_API_KEY: "re_test",
    SERVER_WEB_ORIGIN: "http://localhost:3000",
    SERVER_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    SERVER_GOOGLE_CLIENT_ID: "test-google-client",
    ADMIN_EMAILS: "owner@example.com",
});
EnvService.parse_env();

type Row = Record<string, unknown>;
type Query = {
    where?: Row;
    data?: Row;
    create?: Row;
    update?: Row;
    orderBy?: Row;
    take?: number;
    include?: Row;
};
function match(row: Row, where: Row = {}): boolean {
    return Object.entries(where).every(([key, value]) => {
        if (key === "OR") return (value as Row[]).some((v) => match(row, v));
        if (key === "AND") return (value as Row[]).every((v) => match(row, v));
        const actual = row[key];
        if (value && typeof value === "object" && !(value instanceof Date)) {
            const condition = value as Row;
            return Object.entries(condition).every(([op, v]) => {
                if (op === "in") return (v as unknown[]).includes(actual);
                if (op === "not") return actual !== v;
                if (op === "lt") return (actual as number) < (v as number);
                if (op === "lte") return (actual as number) <= (v as number);
                if (op === "gt") return (actual as number) > (v as number);
                return false;
            });
        }
        return actual instanceof Date && value instanceof Date
            ? actual.getTime() === value.getTime()
            : actual === value;
    });
}
function apply(row: Row, data: Row = {}) {
    for (const [key, value] of Object.entries(data)) {
        row[key] =
            value && typeof value === "object" && "increment" in value
                ? Number(row[key] ?? 0) + Number(value.increment)
                : value;
    }
}

export function fakeDatabase() {
    const users: Row[] = [
        {
            id: "u1",
            email: "user@example.com",
            custodialPublicKey: "original-wallet",
            custodialSecretEncrypted: "original-ciphertext",
            name: "Original",
        },
    ];
    const withdrawals: Row[] = [];
    const notifications: Row[] = [];
    const settlements: Row[] = [];
    let counter = 0;
    const defaults = () => ({
        id: `id-${++counter}`,
        createdAt: new Date(),
        attempts: 0,
        status: "AWAITING_APPROVAL",
        txSignature: null,
        signedTransaction: null,
        leaseUntil: null,
        failure: null,
        acceptedAt: null,
        availableAt: new Date(),
        expiresAt: null,
        stage: "PENDING",
        solanaResolveTxSig: null,
        finalityEvidence: null,
        finalityObservedAt: null,
        submissionClaimedAt: null,
    });
    const attach = (row: Row, query: Query) =>
        query.include?.user ? { ...row, user: users.find((u) => u.id === row.userId) } : { ...row };
    function install(model: object, rows: Row[]) {
        const methods = {
            findUnique: async (q: Query) => {
                const row = rows.find((r) => match(r, q.where));
                return row ? attach(row, q) : null;
            },
            findUniqueOrThrow: async (q: Query) => {
                const row = rows.find((r) => match(r, q.where));
                if (!row) throw new Error("Not found");
                return attach(row, q);
            },
            findFirst: async (q: Query) => {
                const candidates = rows.filter((r) => match(r, q.where));
                const row = q.orderBy ? candidates.at(-1) : candidates[0];
                return row ? attach(row, q) : null;
            },
            findMany: async (q: Query) =>
                rows
                    .filter((r) => match(r, q.where))
                    .slice(0, q.take ?? 100)
                    .map((r) => attach(r, q)),
            create: async (q: Query) => {
                const row = { ...defaults(), ...q.data };
                rows.push(row);
                return { ...row };
            },
            update: async (q: Query) => {
                const row = rows.find((r) => match(r, q.where));
                if (!row) throw new Error("Not found");
                apply(row, q.data);
                return { ...row };
            },
            updateMany: async (q: Query) => {
                const selected = rows.filter((r) => match(r, q.where));
                selected.forEach((r) => apply(r, q.data));
                return { count: selected.length };
            },
            upsert: async (q: Query) => {
                let row = rows.find((r) => match(r, q.where));
                if (row) apply(row, q.update);
                else {
                    row = { ...defaults(), ...q.create };
                    rows.push(row);
                }
                return { ...row };
            },
        };
        for (const [name, fn] of Object.entries(methods))
            spyOn(model, name as never).mockImplementation(fn as never);
    }
    install(prisma.user, users);
    install(prisma.withdrawalIntent, withdrawals);
    install(prisma.notificationOutbox, notifications);
    install(prisma.resolverState, settlements);
    spyOn(prisma, "$queryRaw").mockResolvedValue([]);
    // Simulate the row-lock ordering, not PostgreSQL itself. Integration
    // validation against a disposable PostgreSQL database is still required.
    let queue = Promise.resolve();
    spyOn(prisma, "$transaction").mockImplementation(((
        fn: (_db: typeof prisma) => Promise<unknown>,
    ) => {
        const result = queue.then(() => fn(prisma));
        queue = result.then(
            () => {},
            () => {},
        );
        return result;
    }) as never);
    return { users, withdrawals, notifications, settlements, prisma };
}

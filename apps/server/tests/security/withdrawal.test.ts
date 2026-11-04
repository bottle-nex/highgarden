import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, test, spyOn, mock } from "bun:test";
import { Connection, Keypair, PublicKey, type SignatureStatus } from "@solana/web3.js";
import { AccountLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { fakeDatabase } from "./fixture";
import { ENV } from "../../config/config.env";
const { requestWithdrawal, confirmWithdrawal, amountUnits, approvalHash, withdrawalStatus } =
    await import("../../services/service.withdrawal-approval");
const { recoverWithdrawal } = await import("../../services/service.withdrawal-recovery");
const { default: SolanaWithdrawService } = await import("../../services/service.solana-withdraw");
const { encrypt_secret_key } = await import("../../services/service.crypto");

let db: ReturnType<typeof fakeDatabase>;
const destination = Keypair.generate().publicKey.toBase58();
beforeEach(() => {
    db = fakeDatabase();
});
afterEach(() => mock.restore());
async function request(amount = 1) {
    const intent = await requestWithdrawal("u1", destination, amount);
    const code = String(db.notifications.at(-1)!.text).match(/code is (\d{6})/)![1]!;
    return { intent, code };
}
function chain(statuses: (SignatureStatus | null)[] = [null]) {
    const wallet = Keypair.generate();
    db.users[0]!.custodialPublicKey = wallet.publicKey.toBase58();
    db.users[0]!.custodialSecretEncrypted = encrypt_secret_key(wallet.secretKey.slice(0, 32));
    ENV.SERVER_SOLANA_ADMIN_KEYPAIR = JSON.stringify([...Keypair.generate().secretKey]);
    const mint = new PublicKey(ENV.SERVER_USDC_MINT);
    const source = getAssociatedTokenAddressSync(mint, wallet.publicKey);
    const data = Buffer.alloc(AccountLayout.span);
    AccountLayout.encode(
        {
            mint,
            owner: wallet.publicKey,
            amount: 100000000n,
            delegateOption: 0,
            delegate: PublicKey.default,
            state: 1,
            isNativeOption: 0,
            isNative: 0n,
            delegatedAmount: 0n,
            closeAuthorityOption: 0,
            closeAuthority: PublicKey.default,
        },
        data,
    );
    spyOn(Connection.prototype, "getAccountInfo").mockImplementation(async (key) =>
        key.equals(source)
            ? {
                  data,
                  owner: TOKEN_PROGRAM_ID,
                  lamports: 1,
                  executable: false,
                  rentEpoch: 0,
              }
            : null,
    );
    spyOn(Connection.prototype, "getLatestBlockhash").mockResolvedValue({
        blockhash: PublicKey.default.toBase58(),
        lastValidBlockHeight: 500,
    });
    let poll = 0;
    spyOn(Connection.prototype, "getSignatureStatuses").mockImplementation(async () => ({
        context: { slot: 1 },
        value: [statuses[Math.min(poll++, statuses.length - 1)]!],
    }));
    return spyOn(Connection.prototype, "sendRawTransaction").mockImplementation(async (bytes) => {
        // This is the safety invariant: signing identity is already durable.
        expect(db.withdrawals[0]!.signedTransaction).toBe(
            Buffer.from(bytes as Uint8Array).toString("base64"),
        );
        expect(db.withdrawals[0]!.txSignature).toBeTruthy();
        return String(db.withdrawals[0]!.txSignature);
    });
}

test("integer USDC units reject sub-minimum, fractional micro-units and unsafe values", () => {
    expect(amountUnits(1.000001)).toBe(1000001n);
    for (const amount of [0, 0.999999, 1.0000001, Infinity, NaN, 100000000000])
        expect(() => amountUnits(amount)).toThrow();
});

test("withdrawal code is bound to user, intent, destination and amount", async () => {
    const { intent, code } = await request(1.25);
    const hash = db.withdrawals[0]!.approvalHash;
    for (const [id, user, dest, units] of [
        ["other", "u1", destination, 1250000n],
        [intent.id, "other", destination, 1250000n],
        [intent.id, "u1", "other", 1250000n],
        [intent.id, "u1", destination, 1250001n],
    ] as const) {
        expect(approvalHash(id, user, dest, units, code)).not.toBe(hash);
    }
    await expect(confirmWithdrawal("other", intent.id, code)).rejects.toThrow();
    await expect(withdrawalStatus("other", intent.id)).rejects.toThrow();
    expect(db.withdrawals[0]!.status).toBe("AWAITING_APPROVAL");
});

test("wrong and login-purpose codes consume attempts and lock after five tries", async () => {
    const { intent, code } = await request();
    const wrong = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++)
        await expect(confirmWithdrawal("u1", intent.id, wrong)).rejects.toThrow();
    await expect(confirmWithdrawal("u1", intent.id, code)).rejects.toThrow("locked");
    expect(db.withdrawals[0]!.attempts).toBe(5);
});

test("expired and cancelled approvals cannot execute; resend is delayed and supersedes old code", async () => {
    const first = await request();
    await expect(request()).rejects.toThrow("60 seconds");
    db.withdrawals[0]!.createdAt = new Date(Date.now() - 61000);
    const second = await request();
    await expect(confirmWithdrawal("u1", first.intent.id, first.code)).rejects.toThrow();
    db.withdrawals[1]!.expiresAt = new Date(Date.now() - 1);
    await expect(confirmWithdrawal("u1", second.intent.id, second.code)).rejects.toThrow();
});

test("parallel approval is single use and reuses one intent result", async () => {
    const { intent, code } = await request();
    const results = await Promise.all(
        Array.from({ length: 10 }, () => confirmWithdrawal("u1", intent.id, code)),
    );
    expect(results.every((r) => r.id === intent.id && r.status === "APPROVED")).toBe(true);
    expect(db.withdrawals[0]!.attempts).toBe(1);
    expect(db.withdrawals[0]!.approvalHash).toBe("");
});

test("unapproved intents cannot reach signing or broadcasting", async () => {
    const send = chain();
    const { intent } = await request();
    await new SolanaWithdrawService().withdraw_usdc(intent.id);
    await recoverWithdrawal(intent.id);
    expect(send).not.toHaveBeenCalled();
    expect(db.withdrawals[0]!.signedTransaction).toBeNull();
});

test("network timeouts, concurrent execution and restart reuse identical signed bytes", async () => {
    const send = chain();
    const { intent, code } = await request(2);
    await confirmWithdrawal("u1", intent.id, code);
    send.mockImplementation(async (bytes) => {
        expect(Buffer.from(bytes as Uint8Array).toString("base64")).toBe(
            String(db.withdrawals[0]!.signedTransaction),
        );
        throw new Error("network timeout after submission");
    });
    await Promise.all([recoverWithdrawal(intent.id), recoverWithdrawal(intent.id)]);
    const saved = db.withdrawals[0]!.signedTransaction;
    expect(db.withdrawals[0]!.status).toBe("SIGNED");
    await recoverWithdrawal(intent.id);
    expect(db.withdrawals[0]!.signedTransaction).toBe(saved);
    expect(send).toHaveBeenCalledTimes(2);
    expect(db.notifications).toHaveLength(1);
});

test("finalized transfer and its single receipt commit together; replay never sends again", async () => {
    const send = chain([
        null,
        { slot: 1, confirmations: null, err: null, confirmationStatus: "finalized" },
    ]);
    const { intent, code } = await request(2);
    const before = structuredClone(db.users);
    await confirmWithdrawal("u1", intent.id, code);
    await recoverWithdrawal(intent.id);
    await recoverWithdrawal(intent.id);
    await confirmWithdrawal("u1", intent.id, code);
    await recoverWithdrawal(intent.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.withdrawals[0]!.status).toBe("CONFIRMED");
    expect(
        db.notifications.filter((n) => String(n.dedupeKey).startsWith("withdrawal-receipt:")),
    ).toHaveLength(1);
    expect(db.users).toEqual(before);
});

test("a definite chain rejection needs a new intent and code", async () => {
    const send = chain([
        {
            slot: 1,
            confirmations: null,
            err: { InstructionError: [0, "InsufficientFunds"] },
            confirmationStatus: "finalized",
        },
    ]);
    const { intent, code } = await request();
    await confirmWithdrawal("u1", intent.id, code);
    await recoverWithdrawal(intent.id);
    expect(db.withdrawals[0]!.status).toBe("FAILED");
    await expect(confirmWithdrawal("u1", intent.id, code)).rejects.toThrow();
    await recoverWithdrawal(intent.id);
    expect(send).not.toHaveBeenCalled();
});

test("editing an intent's approved amount or destination invalidates the bound code", async () => {
    const { intent, code } = await request();
    db.withdrawals[0]!.amountUnits = 2000000n;
    await expect(confirmWithdrawal("u1", intent.id, code)).rejects.toThrow("Invalid");
    db.withdrawals[0]!.amountUnits = 1000000n;
    db.withdrawals[0]!.destination = Keypair.generate().publicKey.toBase58();
    await expect(confirmWithdrawal("u1", intent.id, code)).rejects.toThrow("Invalid");
});

test("the migration only adds security storage and leaves financial rows untouched", async () => {
    const sql = await readFile(
        new URL(
            "../../../../packages/database/prisma/migrations/20261104000000_security_boundaries/migration.sql",
            import.meta.url,
        ),
        "utf8",
    );
    expect(sql.replace(/ON (DELETE|UPDATE) (RESTRICT|CASCADE)/g, "")).not.toMatch(
        /\b(?:DELETE|DROP|TRUNCATE|UPDATE|INSERT)\b/i,
    );
    expect(sql).not.toMatch(/ALTER TABLE "(?:User|Fill|Claim|Market|Exposure)"/);
    expect(sql).toContain('ADD COLUMN "finalityObservedAt"');
    expect(sql).toContain('CREATE TABLE "WithdrawalIntent"');
    expect(sql).toContain('CREATE TABLE "NotificationOutbox"');
});

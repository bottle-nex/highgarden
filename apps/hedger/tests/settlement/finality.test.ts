import { afterEach, beforeEach, expect, test, spyOn, mock } from "bun:test";
import { fakeDatabase } from "../../../server/tests/security/fixture";
const { default: ResolverDb } = await import("../../db/resolver");
let db: ReturnType<typeof fakeDatabase>;
beforeEach(() => {
    db = fakeDatabase();
});
afterEach(() => mock.restore());

test("legacy inferred rows and both market kinds wait for fresh finality plus the entire window", async () => {
    const cutoff = new Date(Date.now() - 48 * 3600000);
    db.settlements.push({
        marketId: "legacy",
        stage: "POLYMARKET_RESOLVED",
        solanaResolveTxSig: null,
        winningOutcome: "YES",
        polymarketResolvedAt: new Date(0),
        finalityEvidence: null,
        finalityObservedAt: null,
    });
    expect(await ResolverDb.list_awaiting_solana_submission(cutoff)).toHaveLength(0);
    for (const kind of ["STANDARD", "FAST_MOVING"]) {
        await ResolverDb.record_polymarket_resolved(kind, "YES", new Date(0), "ctf-proof");
        expect(await ResolverDb.list_awaiting_solana_submission(cutoff)).toHaveLength(0);
    }
    for (const row of db.settlements)
        if (row.finalityEvidence) row.finalityObservedAt = new Date(cutoff.getTime() - 1);
    expect(
        (await ResolverDb.list_awaiting_solana_submission(cutoff)).map((r) => r.marketId).sort(),
    ).toEqual(["FAST_MOVING", "STANDARD"]);
});

test("same proof preserves first observation, changed proof restarts the waiting period", async () => {
    await ResolverDb.record_polymarket_resolved("m1", "YES", new Date(0), "proof-1");
    const first = new Date(Date.now() - 100000);
    db.settlements[0]!.finalityObservedAt = first;
    await ResolverDb.record_polymarket_resolved("m1", "YES", new Date(0), "proof-1");
    expect(db.settlements[0]!.finalityObservedAt).toEqual(first);
    await ResolverDb.record_polymarket_resolved("m1", "NO", new Date(0), "proof-2");
    expect(Number(db.settlements[0]!.finalityObservedAt)).toBeGreaterThan(first.getTime());
});

test("claimed submissions and completed settlements cannot be changed by stale reconciliation", async () => {
    await ResolverDb.record_polymarket_resolved("claimed", "YES", new Date(), "proof");
    db.settlements[0]!.submissionClaimedAt = new Date();
    await ResolverDb.record_polymarket_resolved("done", "YES", new Date(), "proof");
    db.settlements[1]!.stage = "REDEEMED";
    db.settlements[1]!.solanaResolveTxSig = "original-signature";
    const before = structuredClone(db.settlements);
    for (const id of ["claimed", "done"]) {
        await ResolverDb.revert_to_pending(id);
        await ResolverDb.update_winning_outcome(id, "NO");
        await ResolverDb.record_polymarket_resolved(id, "NO", new Date(), "new-proof");
    }
    expect(db.settlements).toEqual(before);
});

test("disputed pre-submission results discard evidence and need fresh verification", async () => {
    await ResolverDb.record_polymarket_resolved("m1", "YES", new Date(), "proof");
    await ResolverDb.revert_to_pending("m1");
    expect(db.settlements[0]!.stage).toBe("PENDING");
    expect(db.settlements[0]!.finalityObservedAt).toBeNull();
    expect(db.settlements[0]!.finalityEvidence).toBeNull();
});

test("settlement rechecks live evidence immediately before submitting", async () => {
    Object.assign(process.env, {
        DATABASE_URL: "postgresql://unused:unused@localhost/unused",
        HEDGER_REDIS_URL: "redis://localhost:6379",
        HEDGER_SOLANA_RPC_URL: "http://localhost:8899",
        HEDGER_SOLANA_RPC_WS_URL: "ws://localhost:8900",
        HEDGER_SOLANA_PROGRAM_ID: "11111111111111111111111111111111",
        HEDGER_POLYMARKET_REST_URL: "https://example.test",
        HEDGER_POLYMARKET_GAMMA_URL: "https://example.test",
        HEDGER_LOG_LEVEL: "fatal",
    });
    const { default: Resolver } = await import("../../resolver");
    const { default: Market } = await import("../../db/market");
    spyOn(Market, "get_summary_by_id").mockResolvedValue({
        id: "m1",
        name: "Test",
        polyMarketId: "p1",
        solanaMarketPda: "11111111111111111111111111111111",
    });
    await ResolverDb.record_polymarket_resolved("m1", "YES", new Date(0), "original-proof");
    const row = (await ResolverDb.find("m1"))!;
    const poly = {
        fetch_resolution: mock(async () => ({ winningOutcomeIndex: null, finalityEvidence: null })),
    };
    const resolver = new Resolver({} as never, poly as never);
    const methods = resolver as unknown as {
        submit_one(
            _candidate: NonNullable<Awaited<ReturnType<typeof ResolverDb.find>>>,
        ): Promise<void>;
        send_resolve_to_solana(): Promise<string>;
    };
    const send = spyOn(methods, "send_resolve_to_solana").mockResolvedValue("must-not-send");
    await methods.submit_one(row);
    expect(poly.fetch_resolution).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(db.settlements[0]!.stage).toBe("PENDING");
});

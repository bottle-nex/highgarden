import { afterEach, expect, test, spyOn, mock } from "bun:test";
import { providers, utils } from "ethers";
import { PolymarketClient, binaryPayoutWinner } from "../src/client";

const abi = new utils.Interface([
  "function payoutDenominator(bytes32) view returns (uint256)",
  "function payoutNumerators(bytes32,uint256) view returns (uint256)",
  "function getOutcomeSlotCount(bytes32) view returns (uint256)",
  "function getCollectionId(bytes32,bytes32,uint256) view returns (bytes32)",
  "function getPositionId(address,bytes32) pure returns (uint256)",
]);
const condition = `0x${"a".repeat(64)}`;
const collection = (slot: number) => utils.hexZeroPad(utils.hexlify(slot), 32);
const raw = {
  id: "m1",
  closed: true,
  outcomes: '["Yes","No"]',
  outcomePrices: '["1","0"]',
  clobTokenIds: '["101","102"]',
  conditionId: condition,
  endDate: "2000-01-01",
  negRisk: false,
};
afterEach(() => mock.restore());
function setup(
  metadata: Record<string, unknown> = {},
  payout = ["1", "1", "0"],
  unavailable = false,
) {
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...raw, ...metadata }));
  const provider = new providers.JsonRpcProvider();
  spyOn(provider, "getBlock").mockResolvedValue({ number: 100 } as providers.Block);
  spyOn(provider, "call").mockImplementation(async (tx) => {
    if (unavailable) throw new Error("RPC unavailable");
    const parsed = abi.parseTransaction({ data: String(tx.data) });
    let result: unknown;
    if (parsed.name === "getOutcomeSlotCount") result = 2;
    else if (parsed.name === "payoutDenominator") result = payout[0];
    else if (parsed.name === "payoutNumerators") result = payout[Number(parsed.args[1]) + 1];
    else if (parsed.name === "getCollectionId") result = collection(Number(parsed.args[2]));
    else result = parsed.args[1] === collection(1) ? 101 : 102;
    return abi.encodeFunctionResult(parsed.name, [result]);
  });
  const client = new PolymarketClient({
    restUrl: "https://example.test",
    gammaUrl: "https://example.test",
    polygonRpcUrl: "https://example.test",
  });
  Object.assign(client, { get_polygon_provider: () => provider });
  return client;
}

test("exact binary payouts exclude unresolved, split and approximate price-like results", () => {
  expect(binaryPayoutWinner("100", "100", "0")).toBe(0);
  expect(binaryPayoutWinner("100", "0", "100")).toBe(1);
  for (const values of [
    ["0", "0", "0"],
    ["100", "50", "50"],
    ["1000", "999", "1"],
    ["100", "100", "1"],
  ]) {
    expect(binaryPayoutWinner(...(values as [string, string, string]))).toBeNull();
  }
});
test("finalized payout evidence verifies token positions and starts a fresh observation", async () => {
  const before = Date.now();
  const result = await setup().fetch_resolution("m1");
  expect(result?.winningOutcomeIndex).toBe(0);
  expect(result?.finalityEvidence).toContain(condition);
  expect(result?.resolvedAt!.getTime()).toBeGreaterThanOrEqual(before);
});
test("price-only, split, unresolved and unavailable chain outcomes remain pending", async () => {
  for (const [payout, unavailable] of [
    [["0", "0", "0"], false],
    [["2", "1", "1"], false],
    [["1", "1", "0"], true],
  ] as const) {
    const result = await setup({}, [...payout], unavailable).fetch_resolution("m1");
    expect(result?.winningOutcomeIndex).toBeNull();
    expect(result?.finalityEvidence).toBeNull();
  }
});
test("disputed, unsupported and mismatched metadata cannot establish a winner", async () => {
  for (const metadata of [
    { closed: false },
    { negRisk: true },
    { id: "other" },
    { conditionId: "bad" },
    { clobTokenIds: '["102","101"]' },
    { outcomes: '["A","B"]' },
    { outcomes: '["Yes","No","Maybe"]' },
  ]) {
    const result = await setup(metadata).fetch_resolution("m1");
    expect(result?.winningOutcomeIndex).toBeNull();
    expect(result?.finalityEvidence).toBeNull();
  }
});

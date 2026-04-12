import { initializeConfigTests } from "./instructions/initialize_config";
import { createMarketTests } from "./instructions/create_market";
import { placeOrderTests } from "./instructions/place_order";
import { resolveMarketTests } from "./instructions/resolve_market";
import { claimTests } from "./instructions/claim";
import { adminTests } from "./instructions/admin";
import { createTestContext, TestContext } from "./utils/setup";

describe("contract", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });

  initializeConfigTests(() => ctx);
  createMarketTests(() => ctx);
  placeOrderTests(() => ctx);
  resolveMarketTests(() => ctx);
  claimTests(() => ctx);
  adminTests(() => ctx);
});

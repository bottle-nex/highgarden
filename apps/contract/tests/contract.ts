import { initializeConfigTests } from "./instructions/initialize_config";
import { createMarketTests } from "./instructions/create_market";
import { createTestContext, TestContext } from "./utils/setup";

describe("contract", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await createTestContext();
  });

  initializeConfigTests(() => ctx);
  createMarketTests(() => ctx);
});

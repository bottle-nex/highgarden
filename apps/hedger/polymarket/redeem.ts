import LoggerFactory from "../log/logger";
import HedgerGammaClient from "./gamma";
import PolygonRpcFactory from "./polygon-rpc";
import ConditionalTokensContract, {
  BINARY_INDEX_SETS_BOTH,
  PARENT_COLLECTION_ID_BINARY,
  USDC_E_ADDRESS_POLYGON,
} from "./conditional-tokens";

export interface RedeemInput {
  polymarketMarketId: string;
}

export type RedeemOutcome =
  | { kind: "submitted"; txHash: string }
  | { kind: "skipped_neg_risk" }
  | { kind: "skipped_no_condition_id" }
  | { kind: "skipped_not_resolved" };

export default class PolymarketRedeemer {
  private readonly log = LoggerFactory.for_category("polymarket-redeem");
  private readonly gamma = new HedgerGammaClient();

  public is_configured(): boolean {
    return PolygonRpcFactory.is_configured();
  }

  public async redeem(input: RedeemInput): Promise<RedeemOutcome> {
    const resolution = await this.gamma.fetch_resolution(input.polymarketMarketId);
    if (!resolution || !resolution.closed || resolution.winningOutcomeIndex === null) {
      return { kind: "skipped_not_resolved" };
    }
    if (resolution.negRisk) {
      this.log.warn(
        { polymarketMarketId: input.polymarketMarketId },
        "NegRisk market detected — redemption uses a different contract; skipping for MVP",
      );
      return { kind: "skipped_neg_risk" };
    }
    if (!resolution.conditionId) {
      this.log.warn(
        { polymarketMarketId: input.polymarketMarketId },
        "Gamma did not return conditionId for resolved market",
      );
      return { kind: "skipped_no_condition_id" };
    }
    return this.send_redeem(resolution.conditionId, input.polymarketMarketId);
  }

  private async send_redeem(
    condition_id: string,
    polymarket_market_id: string,
  ): Promise<RedeemOutcome> {
    const signer = PolygonRpcFactory.get_signer();
    const ctf = ConditionalTokensContract.for_signer(signer);

    this.log.info(
      { polymarketMarketId: polymarket_market_id, conditionId: condition_id },
      "submitting redeemPositions on Polygon",
    );

    const tx = await ctf.redeemPositions(
      USDC_E_ADDRESS_POLYGON,
      PARENT_COLLECTION_ID_BINARY,
      condition_id,
      BINARY_INDEX_SETS_BOTH,
    );
    const receipt = await tx.wait(1);
    return { kind: "submitted", txHash: receipt.transactionHash ?? tx.hash };
  }
}

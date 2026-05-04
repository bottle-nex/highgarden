import type { Side, Outcome } from "@solmarket/database";

export interface DirectionInput {
  solanaSide: number;
  solanaOutcome: number;
  yesTokenId: string;
  noTokenId: string;
}

export interface PolymarketHedgeSpec {
  tokenId: string;
  polymarketSide: Side;
  outcome: Outcome;
}

export default class DirectionResolver {
  public resolve(input: DirectionInput): PolymarketHedgeSpec {
    const outcome = this.outcome_from_event(input.solanaOutcome);
    const tokenId = this.token_id_for(outcome, input.yesTokenId, input.noTokenId);
    const polymarketSide = this.polymarket_side_for(input.solanaSide);
    return { tokenId, polymarketSide, outcome };
  }

  private outcome_from_event(raw: number): Outcome {
    if (raw === 0) return "YES";
    if (raw === 1) return "NO";
    throw new Error(`unexpected outcome value: ${raw}`);
  }

  private polymarket_side_for(raw: number): Side {
    if (raw === 0) return "BUY";
    if (raw === 1) return "SELL";
    throw new Error(`unexpected side value: ${raw}`);
  }

  private token_id_for(outcome: Outcome, yes: string, no: string): string {
    return outcome === "YES" ? yes : no;
  }
}

import { Contract, type Wallet } from "ethers";

// Polymarket / Gnosis CTF on Polygon mainnet.
// References:
//   - https://docs.polymarket.com/developers/conditional-tokens
//   - https://github.com/gnosis/conditional-tokens-contracts
export const CONDITIONAL_TOKENS_ADDRESS_POLYGON =
    "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

// Polymarket trades against bridged USDC.e (NOT native USDC).
export const USDC_E_ADDRESS_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

// For binary YES/NO markets the parent is the zero collection.
export const PARENT_COLLECTION_ID_BINARY =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

// indexSets for binary CTF: 1 = YES (slot 0), 2 = NO (slot 1).
// Passing both means "redeem whichever you hold for the resolved outcome".
export const BINARY_INDEX_SETS_BOTH = [1, 2] as const;

const CTF_ABI = [
    "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
    "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
] as const;

export default class ConditionalTokensContract {
    public static for_signer(signer: Wallet): Contract {
        return new Contract(CONDITIONAL_TOKENS_ADDRESS_POLYGON, CTF_ABI, signer);
    }
}

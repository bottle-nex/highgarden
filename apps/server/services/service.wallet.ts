import { address, createSolanaRpc, type Rpc, type SolanaRpcApi } from "@solana/kit";
import {
    fetchMaybeToken,
    findAssociatedTokenPda,
    TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { ENV } from "../config/config.env";

export interface UsdcBalance {
    uiAmount: number;
    uiAmountString: string;
    decimals: number;
}

const USDC_DECIMALS = 6;
const USDC_DIVISOR = 10n ** BigInt(USDC_DECIMALS);

let rpc_singleton: Rpc<SolanaRpcApi> | null = null;
function get_rpc(): Rpc<SolanaRpcApi> {
    if (!rpc_singleton) {
        rpc_singleton = createSolanaRpc(ENV.SERVER_SOLANA_RPC_URL);
    }
    return rpc_singleton;
}

function format_amount(raw: bigint): UsdcBalance {
    const whole = raw / USDC_DIVISOR;
    const frac = raw % USDC_DIVISOR;
    const frac_str = frac.toString().padStart(USDC_DECIMALS, "0");
    const uiAmountString = `${whole}.${frac_str}`;
    return {
        uiAmount: Number(uiAmountString),
        uiAmountString,
        decimals: USDC_DECIMALS,
    };
}

export async function get_user_usdc_balance(public_key: string): Promise<UsdcBalance> {
    const owner = address(public_key);
    const mint = address(ENV.SERVER_USDC_MINT);
    const [ata] = await findAssociatedTokenPda({
        owner,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const account = await fetchMaybeToken(get_rpc(), ata);
    if (!account.exists) {
        return format_amount(0n);
    }
    return format_amount(account.data.amount);
}

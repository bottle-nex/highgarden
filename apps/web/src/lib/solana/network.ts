/**
 * Frontend Solana network config. Three things controlled here:
 *   1. RPC endpoint — from `NEXT_PUBLIC_SOLANA_RPC_URL`, falls back to the
 *      public devnet RPC. Mainnet has to be set explicitly via env now,
 *      so a freshly-cloned dev environment never accidentally targets
 *      mainnet because of a missing variable.
 *   2. USDC mint — `NEXT_PUBLIC_USDC_MINT` (the deployed test mint on
 *      devnet) or canonical mainnet USDC as fallback.
 *   3. Display label — auto-derived from the RPC URL so the deposit
 *      dialog's footer text can't lie about which cluster we're on.
 */
export const SOLANA_RPC_URL =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

export const USDC_MINT_ADDRESS =
    process.env.NEXT_PUBLIC_USDC_MINT
    ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const USDC_DECIMALS = 6;

/**
 * Display-only cluster name, inferred from the RPC URL. `mainnet-beta`,
 * `devnet`, `testnet`, or `localnet` (for `http(s)://localhost*`); anything
 * else falls back to a generic 'custom'. Used by the deposit dialog so
 * users see the actual cluster, not a hardcoded string.
 */
export const SOLANA_NETWORK_LABEL: 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet' | 'custom' =
    (() => {
        const u = SOLANA_RPC_URL.toLowerCase();
        if (u.includes('devnet')) return 'devnet';
        if (u.includes('testnet')) return 'testnet';
        if (u.includes('mainnet') || u.includes('api.mainnet-beta.solana.com')) {
            return 'mainnet-beta';
        }
        if (u.includes('localhost') || u.includes('127.0.0.1') || u.includes('0.0.0.0')) {
            return 'localnet';
        }
        return 'custom';
    })();

/**
 * Dev-time guardrail. If the frontend ever boots with the bundle still
 * pointing at the mainnet fallback (which usually means the
 * NEXT_PUBLIC_SOLANA_RPC_URL env wasn't reloaded after editing `.env`),
 * shout in the console so the operator sees it instead of debugging a
 * mysterious Phantom "simulation reverted" warning.
 */
if (typeof window !== 'undefined' && SOLANA_NETWORK_LABEL === 'mainnet-beta') {
     
    console.warn(
        '[network] Frontend is on MAINNET — if you intended devnet, set NEXT_PUBLIC_SOLANA_RPC_URL in apps/web/.env and restart `next dev`.',
    );
}

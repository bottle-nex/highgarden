'use client';
import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { USDC_MINT_ADDRESS } from '@/lib/solana/network';

interface State {
    /** Decimal-formatted balance, e.g. 12.5. `null` while loading or before connect. */
    ui_amount: number | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

const USDC_MINT = new PublicKey(USDC_MINT_ADDRESS);

/**
 * Reads the connected external wallet's USDC token balance via the wallet-adapter
 * connection. Returns `0` when the wallet has no USDC ATA yet.
 */
export function useExternalWalletUsdc(): State {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [ui_amount, set_ui_amount] = useState<number | null>(null);
    const [loading, set_loading] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!publicKey) {
            set_ui_amount(null);
            return;
        }
        set_loading(true);
        set_error(null);
        try {
            const ata = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
            // getAccountInfo first to distinguish "no ATA yet" (balance = 0) from
            // a real RPC error — different providers phrase the latter differently.
            const account_info = await connection.getAccountInfo(ata, 'confirmed');
            if (!account_info) {
                set_ui_amount(0);
                return;
            }
            const balance = await connection.getTokenAccountBalance(ata, 'confirmed');
            const v = balance.value;
            // uiAmount can be null for tiny amounts; fall back to uiAmountString → amount/10^decimals.
            const ui =
                v.uiAmount ?? Number(v.uiAmountString) ?? Number(v.amount) / 10 ** v.decimals;
            set_ui_amount(Number.isFinite(ui) ? ui : 0);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[useExternalWalletUsdc] balance fetch failed', msg);
            set_error(msg);
            set_ui_amount(null);
        } finally {
            set_loading(false);
        }
    }, [connection, publicKey]);

    useEffect(() => {
         
        void refetch();
    }, [refetch]);

    return { ui_amount, loading, error, refetch };
}

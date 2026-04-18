import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export interface WalletState {
    /** Base-58 public key of the connected Solana wallet, null if not connected */
    address: string | null;
    /** USDC balance on Solana in decimal units (e.g. 50.25) */
    usdcBalance: number | null;
    balanceLoading: boolean;
    /** Lamports balance for fee estimation */
    solBalance: number | null;

    // Actions
    connect: (address: string) => void;
    disconnect: () => void;
    setUsdcBalance: (balance: number) => void;
    setSolBalance: (lamports: number) => void;
    setBalanceLoading: (v: boolean) => void;
}

export const useWalletStore = create<WalletState>()(
    devtools(
        persist(
            (set) => ({
                address: null,
                usdcBalance: null,
                balanceLoading: false,
                solBalance: null,

                connect: (address) =>
                    set({ address, usdcBalance: null, solBalance: null }, false, 'wallet/connect'),

                disconnect: () =>
                    set(
                        {
                            address: null,
                            usdcBalance: null,
                            solBalance: null,
                            balanceLoading: false,
                        },
                        false,
                        'wallet/disconnect',
                    ),

                setUsdcBalance: (usdcBalance) =>
                    set({ usdcBalance, balanceLoading: false }, false, 'wallet/setUsdcBalance'),

                setSolBalance: (lamports) =>
                    set({ solBalance: lamports }, false, 'wallet/setSolBalance'),

                setBalanceLoading: (balanceLoading) =>
                    set({ balanceLoading }, false, 'wallet/setBalanceLoading'),
            }),
            {
                name: 'wallet-store',
                storage: createJSONStorage(() => localStorage),
                // Only persist the connected address — balances must be re-fetched
                partialize: (s) => ({ address: s.address }),
            },
        ),
        { name: 'WalletStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectWalletAddress = (s: WalletState) => s.address;
export const selectIsWalletConnected = (s: WalletState) => s.address !== null;
export const selectUsdcBalance = (s: WalletState) => s.usdcBalance;
export const selectSolBalance = (s: WalletState) => s.solBalance;

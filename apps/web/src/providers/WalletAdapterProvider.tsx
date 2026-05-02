'use client';
import { useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import type { Adapter, WalletError } from '@solana/wallet-adapter-base';
import { WalletConnectionError, WalletNotReadyError } from '@solana/wallet-adapter-base';
import '@solana/wallet-adapter-react-ui/styles.css';
import { SOLANA_RPC_URL } from '@/lib/solana/network';

interface Props {
    children: React.ReactNode;
}

/**
 * Wraps the app with Solana wallet-adapter providers (RPC connection, wallet
 * registry, and the wallet-picker modal). Phantom (and most modern wallets)
 * register themselves via Wallet Standard, so we only ship explicit legacy
 * adapters for wallets that still need them.
 */
export default function WalletAdapterProvider({ children }: Props) {
    const wallets = useMemo(() => [new SolflareWalletAdapter()], []);

    const onError = useCallback((error: WalletError, adapter?: Adapter) => {
        // Auto-connect rejections (wallet locked, site not yet approved) bubble
        // up as opaque "Unexpected error". Drop the stored wallet so the user
        // sees the picker again on next click instead of getting stuck.
        if (error instanceof WalletConnectionError || error instanceof WalletNotReadyError) {
            try {
                window.localStorage.removeItem('walletName');
            } catch {
                // ignore — storage may be unavailable in private windows
            }
            return;
        }
        console.error('[wallet]', adapter?.name ?? 'unknown', error);
    }, []);

    return (
        <ConnectionProvider endpoint={SOLANA_RPC_URL}>
            <WalletProvider wallets={wallets} autoConnect onError={onError}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}

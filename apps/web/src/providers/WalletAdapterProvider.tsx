'use client';
import { useMemo } from 'react';
import {
    ConnectionProvider,
    WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';
import { SOLANA_RPC_URL } from '@/lib/solana/network';

interface Props {
    children: React.ReactNode;
}

/**
 * Wraps the app with Solana wallet-adapter providers (RPC connection, wallet
 * registry, and the wallet-picker modal). Wallet-Standard wallets register
 * themselves automatically; the explicit adapters below cover wallets that
 * still need a legacy adapter.
 */
export default function WalletAdapterProvider({ children }: Props) {
    const wallets = useMemo(
        () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
        [],
    );

    return (
        <ConnectionProvider endpoint={SOLANA_RPC_URL}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}

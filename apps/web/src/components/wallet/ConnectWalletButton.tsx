'use client';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PiWallet, PiSignOut } from 'react-icons/pi';
import { Button } from '@/components/ui/button';

interface Props {
    onConnected?: (publicKey: string) => void;
    className?: string;
}

function shorten(pubkey: string): string {
    return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
}

/**
 * Drives wallet connection state. Shows "Connect wallet" when disconnected;
 * once a wallet picks, shows the address with a small disconnect affordance.
 */
export default function ConnectWalletButton({ onConnected, className }: Props) {
    const { publicKey, disconnect, connecting } = useWallet();
    const { setVisible } = useWalletModal();

    if (publicKey) {
        const address = publicKey.toBase58();
        onConnected?.(address);
        return (
            <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => void disconnect()}
                className={className}
            >
                <PiWallet />
                <span className="font-mono">{shorten(address)}</span>
                <PiSignOut className="opacity-60" />
            </Button>
        );
    }

    return (
        <Button
            size="lg"
            disabled={connecting}
            onClick={() => setVisible(true)}
            className={className}
        >
            <PiWallet />
            {connecting ? 'Connecting…' : 'Connect wallet'}
        </Button>
    );
}

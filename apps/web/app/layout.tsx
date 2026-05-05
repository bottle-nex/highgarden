import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import LenisProvider from '@/providers/LenisProvider';
import AuthSessionProvider from '@/providers/AuthSessionProvider';
import WalletAdapterProvider from '@/providers/WalletAdapterProvider';
import SessionSetter from '@/components/utility/SessionSetter';
import WebSocketHost from '@/components/utility/WebSocketHost';
import SignInModal from '@/components/auth/SignInModal';
import { Toaster } from 'sonner';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
});

export const metadata: Metadata = {
    metadataBase: new URL('https://solmarket.xyz'),
    title: {
        default: 'SolMarket | The First Prediction Market Native to Solana',
        template: '%s · SolMarket',
    },
    description:
        'SolMarket is a Solana-native prediction market. Trade YES/NO outcomes on real-world events with deep day-one liquidity mirrored from Polymarket, settled in Solana USDC, with the speed and fees Solana traders expect.',
    applicationName: 'SolMarket',
    keywords: [
        'Solana prediction market',
        'Polymarket on Solana',
        'prediction markets',
        'YES/NO markets',
        'Solana DeFi',
        'USDC prediction market',
        'onchain betting',
        'event trading',
        'crypto prediction market',
    ],
    authors: [{ name: 'SolMarket' }],
    creator: 'SolMarket',
    openGraph: {
        type: 'website',
        url: 'https://solmarket.xyz',
        siteName: 'SolMarket',
        title: 'SolMarket | Polymarket on Solana',
        description:
            'A Solana-native prediction market with day-one liquidity. Trade event outcomes in Solana USDC with tight spreads, instant settlement, and a Polymarket-deep order book.',
        images: [
            {
                url: '/images/landing/hero.png',
                width: 1200,
                height: 630,
                alt: 'SolMarket | the first prediction market native to Solana',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'SolMarket | Polymarket on Solana',
        description:
            'The first prediction market native to Solana. Deep day-one liquidity, Solana-speed trading, USDC settlement.',
        images: ['/images/landing/hero.png'],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    icons: { icon: '/favicon.ico' },
    category: 'finance',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={cn('h-full', 'antialiased', inter.variable, 'font-sans')}>
            <body className="min-h-full flex flex-col tracking-wide">
                <AuthSessionProvider>
                    <WalletAdapterProvider>
                        <SessionSetter />
                        <WebSocketHost />
                        <SignInModal />
                        <Toaster
                            position="top-center"
                            theme="dark"
                            toastOptions={{
                                style: {
                                    background: 'var(--color-dark-base)',
                                    border: '0.5px solid var(--color-dark-faded)',
                                },
                            }}
                        />
                        <LenisProvider>{children}</LenisProvider>
                    </WalletAdapterProvider>
                </AuthSessionProvider>
            </body>
        </html>
    );
}

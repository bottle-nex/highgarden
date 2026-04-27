import type { Feature } from './types';

export const FEATURES: Feature[] = [
    {
        label: 'Real-Time Trading',
        title: 'Instant Execution,\nZero Lag',
        description:
            'Sub-second settlement powered by Solana. Place predictions and watch outcomes resolve in real time - no waiting, no delays, no compromise.',
        stats: [
            { value: '< 1s', label: 'Settlement' },
            { value: '65K', label: 'TPS Capacity' },
            { value: '280+', label: 'Trades / min' },
        ],
        accent: 'rgba(0, 47, 255, 0.5)',
        accentGlow: 'rgba(255, 65, 0, 0.07)',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
        ),
    },
    {
        label: 'Trustless Architecture',
        title: 'Fully On-Chain,\nFully Transparent',
        description:
            'Every market, every trade, every settlement - verifiable on-chain. No intermediaries, no counterparty risk. Pure protocol.',
        stats: [
            { value: '100%', label: 'On-Chain' },
            { value: '0', label: 'Intermediaries' },
            { value: '3x', label: 'Audited' },
        ],
        accent: 'rgba(120, 80, 255, 0.5)',
        accentGlow: 'rgba(120, 80, 255, 0.07)',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        ),
    },
    {
        label: 'Market Intelligence',
        title: 'Data-Driven\nPredictions',
        description:
            'Deep analytics, live sentiment tracking, and real-time odds. All the signal you need to make informed predictions at the speed of the market.',
        stats: [
            { value: '42', label: 'Active Markets' },
            { value: 'Live', label: 'Sentiment Feed' },
            { value: '$1.8M', label: 'Volume' },
        ],
        accent: 'rgba(0, 180, 255, 0.5)',
        accentGlow: 'rgba(0, 180, 255, 0.07)',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M3 3v18h18" />
                <path d="M7 17l4-8 4 4 6-10" />
            </svg>
        ),
    },
    {
        label: 'Rewards & Incentives',
        title: 'Earn While\nYou Predict',
        description:
            'Liquidity providers and top predictors earn protocol rewards. Stake, predict, provide liquidity - every action compounds your returns.',
        stats: [
            { value: '12%', label: 'Avg APY' },
            { value: '1.2K+', label: 'Traders' },
            { value: 'Auto', label: 'Compound' },
        ],
        accent: 'rgba(255, 180, 0, 0.5)',
        accentGlow: 'rgba(255, 180, 0, 0.07)',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M6 3h12l4 6-10 13L2 9z" />
                <path d="M11 3l1 6h6" />
                <path d="M13 3l-1 6H6" />
                <path d="M2 9h20" />
            </svg>
        ),
    },
    {
        label: 'Community Governance',
        title: 'Governed by\nthe People',
        description:
            'Token holders shape the protocol - propose new markets, vote on parameters, and steer the roadmap. Decentralized decision-making, not top-down control.',
        stats: [
            { value: 'DAO', label: 'Structure' },
            { value: '850+', label: 'Proposals' },
            { value: '24h', label: 'Vote Cycle' },
        ],
        accent: 'rgba(0, 220, 130, 0.5)',
        accentGlow: 'rgba(0, 220, 130, 0.07)',
        icon: (
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        ),
    },
];

export const STREAM_LINES = [
    { top: 32, dur: 4.0, w1: 12, w2: 45, w3: 18 },
    { top: 40, dur: 4.6, w1: 18, w2: 55, w3: 22 },
    { top: 48, dur: 5.2, w1: 8, w2: 38, w3: 14 },
    { top: 56, dur: 3.8, w1: 22, w2: 50, w3: 16 },
    { top: 64, dur: 4.4, w1: 15, w2: 42, w3: 20 },
    { top: 72, dur: 5.0, w1: 10, w2: 35, w3: 12 },
];

export const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

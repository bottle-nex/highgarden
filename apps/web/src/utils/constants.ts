export type Trend = 'up' | 'down' | 'flat';

export interface ProbabilityPoint {
    date: string;
    value: number;
}

export interface FeaturedMarket {
    id: string;
    title: string;
    category: string;
    description: string;
    probabilities: ProbabilityPoint[];
    currentProbability: number;
    openDate: string;
    closeDate: string;
    volume: string;
    liquidity: string;
    traders: number;
    trend: Trend;
}

export interface Market {
    id: string;
    title: string;
    category: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
    change24h: number;
    endsIn: string;
}

export interface BreakingNewsItem {
    id: string;
    title: string;
    probability: number;
    delta: number;
    trend: Trend;
    time: string;
}

export interface HotTopic {
    id: string;
    rank: number;
    title: string;
    category: string;
    volume: string;
    traders: number;
}

export const CATEGORY_TABS = [
    'Trending',
    'Breaking',
    'New',
    'Politics',
    'Sports',
    'Crypto',
    'Geopolitics',
    'Culture',
    'Tech',
    'Economy',
    'Weather',
    'Elections',
    'Mentions',
] as const;

export const featuredMarket: FeaturedMarket = {
    id: 'fm-001',
    title: 'US x IRAN permanent peace deal signed before July 2026?',
    category: 'GEOPOLITICS',
    description:
        'Market resolves YES if a bilateral permanent peace agreement between the United States and Iran is formally signed and announced by both heads of state before July 1, 2026.',
    probabilities: [
        { date: 'MAR 18', value: 14 },
        { date: 'MAR 25', value: 18 },
        { date: 'APR 01', value: 22 },
        { date: 'APR 08', value: 19 },
        { date: 'APR 15', value: 27 },
        { date: 'APR 22', value: 31 },
        { date: 'APR 30', value: 35 },
        { date: 'MAY 07', value: 33 },
        { date: 'MAY 14', value: 41 },
        { date: 'MAY 21', value: 38 },
        { date: 'MAY 28', value: 44 },
        { date: 'JUN 04', value: 47 },
    ],
    currentProbability: 47,
    openDate: 'MAR 18, 2026',
    closeDate: 'JUL 01, 2026',
    volume: '$4.2M',
    liquidity: '$812K',
    traders: 2148,
    trend: 'up',
};

export const marketList: Market[] = [
    {
        id: 'mk-001',
        title: 'Will BTC close above $120K on June 30?',
        category: 'CRYPTO',
        yesPrice: 62,
        noPrice: 38,
        volume: '$1.9M',
        change24h: 4.2,
        endsIn: '17D',
    },
    {
        id: 'mk-002',
        title: 'Fed cuts rates at June FOMC meeting?',
        category: 'POLITICS',
        yesPrice: 28,
        noPrice: 72,
        volume: '$3.4M',
        change24h: -2.1,
        endsIn: '09D',
    },
    {
        id: 'mk-003',
        title: 'Lakers reach the 2026 NBA Finals?',
        category: 'SPORTS',
        yesPrice: 11,
        noPrice: 89,
        volume: '$640K',
        change24h: -0.8,
        endsIn: '22D',
    },
    {
        id: 'mk-004',
        title: 'SOL above $300 by end of Q2 2026?',
        category: 'CRYPTO',
        yesPrice: 41,
        noPrice: 59,
        volume: '$2.7M',
        change24h: 6.5,
        endsIn: '45D',
    },
    {
        id: 'mk-005',
        title: 'OpenAI releases GPT-6 before August 2026?',
        category: 'TECH',
        yesPrice: 19,
        noPrice: 81,
        volume: '$1.1M',
        change24h: 1.3,
        endsIn: '112D',
    },
    {
        id: 'mk-006',
        title: 'Ukraine ceasefire agreed before September?',
        category: 'GEOPOLITICS',
        yesPrice: 34,
        noPrice: 66,
        volume: '$5.8M',
        change24h: 3.7,
        endsIn: '140D',
    },
    {
        id: 'mk-007',
        title: 'Taylor Swift announces new album in May?',
        category: 'CULTURE',
        yesPrice: 57,
        noPrice: 43,
        volume: '$420K',
        change24h: -1.4,
        endsIn: '11D',
    },
    {
        id: 'mk-008',
        title: 'SpaceX Starship full orbital flight in Q2?',
        category: 'TECH',
        yesPrice: 48,
        noPrice: 52,
        volume: '$1.6M',
        change24h: 2.9,
        endsIn: '56D',
    },
];

export const breakingNews: BreakingNewsItem[] = [
    {
        id: 'bn-001',
        title: 'Fed chair hints at dovish pivot in latest speech',
        probability: 28,
        delta: 4,
        trend: 'up',
        time: '2M AGO',
    },
    {
        id: 'bn-002',
        title: 'Iran delegation arrives in Geneva for closed talks',
        probability: 47,
        delta: 6,
        trend: 'up',
        time: '14M AGO',
    },
    {
        id: 'bn-003',
        title: 'BTC rejected at $118K resistance, thin liquidity',
        probability: 62,
        delta: -3,
        trend: 'down',
        time: '31M AGO',
    },
    {
        id: 'bn-004',
        title: 'NBA playoffs bracket locked — LAL seeded 4',
        probability: 11,
        delta: -1,
        trend: 'down',
        time: '1H AGO',
    },
    {
        id: 'bn-005',
        title: 'SpaceX files new Starship static-fire window',
        probability: 48,
        delta: 2,
        trend: 'up',
        time: '2H AGO',
    },
];

export interface DashboardStat {
    label: string;
    value: string;
    delta: string;
    trend: Trend;
}

export const dashboardStats: DashboardStat[] = [
    { label: '24H VOLUME', value: '$12.4M', delta: '+8.2%', trend: 'up' },
    { label: 'ACTIVE MARKETS', value: '284', delta: '+12', trend: 'up' },
    { label: 'RESOLVED TODAY', value: '17', delta: '$2.1M', trend: 'flat' },
    { label: 'TOP MOVER', value: 'SOL Q2', delta: '+6.5%', trend: 'up' },
];

export interface TickerTrade {
    id: string;
    market: string;
    side: 'YES' | 'NO';
    price: number;
    size: string;
}

export const tickerTrades: TickerTrade[] = [
    { id: 't-1', market: 'BTC > $120K', side: 'YES', price: 62, size: '$1.2K' },
    { id: 't-2', market: 'FED JUNE CUT', side: 'NO', price: 72, size: '$840' },
    { id: 't-3', market: 'US x IRAN PEACE', side: 'YES', price: 47, size: '$3.4K' },
    { id: 't-4', market: 'LAL FINALS', side: 'NO', price: 89, size: '$210' },
    { id: 't-5', market: 'SOL > $300', side: 'YES', price: 41, size: '$2.1K' },
    { id: 't-6', market: 'GPT-6 BEFORE AUG', side: 'NO', price: 81, size: '$960' },
    { id: 't-7', market: 'UKRAINE CEASEFIRE', side: 'YES', price: 34, size: '$5.2K' },
    { id: 't-8', market: 'STARSHIP ORBITAL', side: 'YES', price: 48, size: '$1.8K' },
];

/* ── Staking Market Types ─────────────────────────────── */

export interface YesNoMarket {
    id: string;
    title: string;
    category: string;
    yesPrice: number;
    noPrice: number;
    volume: string;
    traders: number;
    change24h: number;
    endsIn: string;
    description: string;
    imageUrl?: string | null;
}

export interface Candidate {
    name: string;
    probability: number;
    change: number;
    image?: string;
}

export interface MultiCandidateMarket {
    id: string;
    title: string;
    category: string;
    candidates: Candidate[];
    volume: string;
    traders: number;
    endsIn: string;
}

export interface OptionChoice {
    label: string;
    probability: number;
    change: number;
}

export interface MultiOptionMarket {
    id: string;
    title: string;
    category: string;
    options: OptionChoice[];
    volume: string;
    traders: number;
    endsIn: string;
}

export const yesNoMarkets: YesNoMarket[] = [
    {
        id: 'yn-001',
        title: 'Will the Fed cut rates at the June 2026 FOMC meeting?',
        category: 'POLITICS',
        yesPrice: 28,
        noPrice: 72,
        volume: '$3.4M',
        traders: 1820,
        change24h: -2.1,
        endsIn: '9D',
        description:
            'Resolves YES if the Federal Reserve announces a rate cut of at least 25bps at the June 2026 FOMC meeting.',
    },
    {
        id: 'yn-002',
        title: 'SpaceX Starship completes full orbital flight in Q2 2026?',
        category: 'TECH',
        yesPrice: 48,
        noPrice: 52,
        volume: '$1.6M',
        traders: 990,
        change24h: 2.9,
        endsIn: '56D',
        description:
            'Resolves YES if SpaceX Starship successfully completes a full orbital trajectory and controlled re-entry before July 1, 2026.',
    },
    {
        id: 'yn-003',
        title: 'Ukraine ceasefire agreement signed before September 2026?',
        category: 'GEOPOLITICS',
        yesPrice: 34,
        noPrice: 66,
        volume: '$5.8M',
        traders: 3301,
        change24h: 3.7,
        endsIn: '140D',
        description:
            'Resolves YES if an official ceasefire agreement is signed by representatives of both Ukraine and Russia before September 1, 2026.',
    },
];

export const multiCandidateMarkets: MultiCandidateMarket[] = [
    {
        id: 'mc-001',
        title: 'Who will win the 2026 FIFA World Cup?',
        category: 'SPORTS',
        candidates: [
            { name: 'Brazil', probability: 22, change: 1.4 },
            { name: 'France', probability: 19, change: -0.8 },
            { name: 'Argentina', probability: 17, change: 2.1 },
            { name: 'Germany', probability: 12, change: 0.3 },
            { name: 'England', probability: 10, change: -1.2 },
            { name: 'Spain', probability: 9, change: 0.6 },
        ],
        volume: '$8.2M',
        traders: 5420,
        endsIn: '62D',
    },
    {
        id: 'mc-002',
        title: 'Next Twitter / X CEO after Elon Musk?',
        category: 'TECH',
        candidates: [
            { name: 'Linda Yaccarino', probability: 35, change: -2.0 },
            { name: 'Jason Calacanis', probability: 18, change: 4.1 },
            { name: 'David Sacks', probability: 14, change: 1.5 },
            { name: 'Sriram Krishnan', probability: 11, change: 0.8 },
            { name: 'Other', probability: 22, change: -4.4 },
        ],
        volume: '$2.1M',
        traders: 1890,
        endsIn: '180D',
    },
];

export const multiOptionMarkets: MultiOptionMarket[] = [
    {
        id: 'mo-001',
        title: 'What will WTI Crude Oil (WTI) hit in April 2026?',
        category: 'FINANCE',
        options: [
            { label: '> $85', probability: 63, change: 4.2 },
            { label: '> $90', probability: 92, change: 1.1 },
            { label: '> $80', probability: 31, change: -2.3 },
            { label: '> $75', probability: 12, change: -0.8 },
        ],
        volume: '$6.7M',
        traders: 3180,
        endsIn: '14D',
    },
    {
        id: 'mo-002',
        title: 'Bitcoin price range on June 30, 2026?',
        category: 'CRYPTO',
        options: [
            { label: '< $100K', probability: 15, change: -1.2 },
            { label: '$100K – $120K', probability: 33, change: 2.4 },
            { label: '$120K – $150K', probability: 35, change: 1.8 },
            { label: '> $150K', probability: 17, change: -3.0 },
        ],
        volume: '$11.3M',
        traders: 7250,
        endsIn: '74D',
    },
    {
        id: 'mo-003',
        title: 'Global average temperature anomaly in 2026?',
        category: 'SCIENCE',
        options: [
            { label: '< +1.3°C', probability: 8, change: -0.5 },
            { label: '+1.3°C to +1.5°C', probability: 42, change: 1.2 },
            { label: '+1.5°C to +1.7°C', probability: 38, change: -0.9 },
            { label: '> +1.7°C', probability: 12, change: 0.2 },
        ],
        volume: '$1.4M',
        traders: 820,
        endsIn: '259D',
    },
];

/* ── Market Detail Page Types ────────────────────────── */

export type MarketType = 'yes-no' | 'multi-candidate' | 'multi-option';
export type MarketStatus = 'live' | 'closed' | 'pending';

export interface MarketOutcome {
    id: string;
    label: string;
    probability: number;
    volume: string;
    change: number;
}

export interface MarketTrade {
    id: string;
    side: string;
    outcome: string;
    price: number;
    amount: string;
    time: string;
    trader: string;
}

export interface MarketRule {
    yesCondition: string;
    noCondition: string;
    sourceOfTruth: string;
    additionalNotes?: string;
}

export interface MarketDetail {
    id: string;
    slug: string;
    title: string;
    category: string;
    status: MarketStatus;
    type: MarketType;
    description: string;
    endDate: string;
    resolutionDate: string;
    createdDate: string;
    volume: string;
    liquidity: string;
    traders: number;
    trend: Trend;
    change24h: number;
    outcomes: MarketOutcome[];
    priceHistory: ProbabilityPoint[];
    rules: MarketRule;
    recentTrades: MarketTrade[];
    relatedMarketIds: string[];
}

export const marketDetails: MarketDetail[] = [
    {
        id: 'mk-001',
        slug: 'btc-120k-june-2026',
        title: 'Will BTC close above $120K on June 30?',
        category: 'CRYPTO',
        status: 'live',
        type: 'yes-no',
        description:
            'This market resolves YES if the closing price of Bitcoin (BTC/USD) on Coinbase is above $120,000 at 11:59 PM UTC on June 30, 2026. The settlement price will be sourced from the Coinbase BTC-USD trading pair.',
        endDate: 'MAY 04, 2026',
        resolutionDate: 'JUN 30, 2026',
        createdDate: 'MAR 01, 2026',
        volume: '$1.9M',
        liquidity: '$420K',
        traders: 1340,
        trend: 'up',
        change24h: 4.2,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 62, volume: '$1.1M', change: 4.2 },
            { id: 'o-2', label: 'NO', probability: 38, volume: '$800K', change: -4.2 },
        ],
        priceHistory: [
            { date: 'MAR 01', value: 45 },
            { date: 'MAR 08', value: 48 },
            { date: 'MAR 15', value: 44 },
            { date: 'MAR 22', value: 51 },
            { date: 'MAR 29', value: 53 },
            { date: 'APR 05', value: 49 },
            { date: 'APR 12', value: 55 },
            { date: 'APR 19', value: 58 },
            { date: 'APR 26', value: 56 },
            { date: 'MAY 03', value: 62 },
        ],
        rules: {
            yesCondition:
                'BTC/USD closing price on Coinbase is strictly above $120,000 at 11:59 PM UTC on June 30, 2026.',
            noCondition:
                'BTC/USD closing price on Coinbase is at or below $120,000 at 11:59 PM UTC on June 30, 2026.',
            sourceOfTruth: 'Coinbase BTC-USD spot price at the resolution timestamp.',
            additionalNotes:
                'In the event of an exchange outage, the CoinGecko aggregate price will serve as the fallback source.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'YES',
                price: 62,
                amount: '$2.4K',
                time: '2m ago',
                trader: '0x8f3a...c1d2',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: 'NO',
                price: 38,
                amount: '$1.1K',
                time: '5m ago',
                trader: '0x2b1c...e4f8',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: 'YES',
                price: 61,
                amount: '$800',
                time: '8m ago',
                trader: '0xd4e7...a9b3',
            },
            {
                id: 'rt-4',
                side: 'BUY',
                outcome: 'NO',
                price: 39,
                amount: '$3.2K',
                time: '12m ago',
                trader: '0x6f2a...d8c1',
            },
            {
                id: 'rt-5',
                side: 'SELL',
                outcome: 'YES',
                price: 60,
                amount: '$500',
                time: '18m ago',
                trader: '0x1a9b...f3e7',
            },
            {
                id: 'rt-6',
                side: 'BUY',
                outcome: 'YES',
                price: 61,
                amount: '$1.8K',
                time: '23m ago',
                trader: '0xc3d8...b2a4',
            },
        ],
        relatedMarketIds: ['mk-004', 'mk-002', 'mk-005'],
    },
    {
        id: 'mk-002',
        slug: 'fed-rate-cut-june-2026',
        title: 'Fed cuts rates at June FOMC meeting?',
        category: 'POLITICS',
        status: 'live',
        type: 'yes-no',
        description:
            'This market resolves YES if the Federal Reserve announces a reduction of the federal funds rate target range at the June 2026 FOMC meeting.',
        endDate: 'JUN 12, 2026',
        resolutionDate: 'JUN 14, 2026',
        createdDate: 'FEB 15, 2026',
        volume: '$3.4M',
        liquidity: '$680K',
        traders: 1820,
        trend: 'down',
        change24h: -2.1,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 28, volume: '$950K', change: -2.1 },
            { id: 'o-2', label: 'NO', probability: 72, volume: '$2.45M', change: 2.1 },
        ],
        priceHistory: [
            { date: 'FEB 15', value: 42 },
            { date: 'FEB 22', value: 38 },
            { date: 'MAR 01', value: 41 },
            { date: 'MAR 08', value: 35 },
            { date: 'MAR 15', value: 33 },
            { date: 'MAR 22', value: 30 },
            { date: 'MAR 29', value: 32 },
            { date: 'APR 05', value: 29 },
            { date: 'APR 12', value: 31 },
            { date: 'APR 19', value: 28 },
        ],
        rules: {
            yesCondition:
                'The FOMC announces a rate cut of at least 25 basis points at the June 2026 meeting.',
            noCondition: 'The FOMC holds rates steady or raises rates at the June 2026 meeting.',
            sourceOfTruth: 'Federal Reserve FOMC press release.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'SELL',
                outcome: 'YES',
                price: 28,
                amount: '$1.5K',
                time: '1m ago',
                trader: '0x3e7a...b2c9',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'NO',
                price: 72,
                amount: '$2.8K',
                time: '4m ago',
                trader: '0xa1f3...d4e6',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: 'YES',
                price: 29,
                amount: '$600',
                time: '11m ago',
                trader: '0x8c2d...e7f1',
            },
            {
                id: 'rt-4',
                side: 'SELL',
                outcome: 'NO',
                price: 71,
                amount: '$4.1K',
                time: '15m ago',
                trader: '0xb5a9...c3d8',
            },
            {
                id: 'rt-5',
                side: 'BUY',
                outcome: 'NO',
                price: 72,
                amount: '$920',
                time: '22m ago',
                trader: '0xf2e1...a8b4',
            },
        ],
        relatedMarketIds: ['mk-001', 'mk-006', 'mk-004'],
    },
    {
        id: 'mk-004',
        slug: 'sol-300-q2-2026',
        title: 'SOL above $300 by end of Q2 2026?',
        category: 'CRYPTO',
        status: 'live',
        type: 'yes-no',
        description:
            'This market resolves YES if the spot price of Solana (SOL/USD) on Coinbase exceeds $300 at any point before July 1, 2026.',
        endDate: 'JUN 01, 2026',
        resolutionDate: 'JUL 01, 2026',
        createdDate: 'MAR 10, 2026',
        volume: '$2.7M',
        liquidity: '$510K',
        traders: 1502,
        trend: 'up',
        change24h: 6.5,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 41, volume: '$1.1M', change: 6.5 },
            { id: 'o-2', label: 'NO', probability: 59, volume: '$1.6M', change: -6.5 },
        ],
        priceHistory: [
            { date: 'MAR 10', value: 22 },
            { date: 'MAR 17', value: 26 },
            { date: 'MAR 24', value: 24 },
            { date: 'MAR 31', value: 30 },
            { date: 'APR 07', value: 28 },
            { date: 'APR 14', value: 35 },
            { date: 'APR 21', value: 33 },
            { date: 'APR 28', value: 38 },
            { date: 'MAY 05', value: 41 },
        ],
        rules: {
            yesCondition:
                'SOL/USD spot price on Coinbase exceeds $300.00 at any point before July 1, 2026 00:00 UTC.',
            noCondition: 'SOL/USD never reaches $300.00 on Coinbase before the deadline.',
            sourceOfTruth: 'Coinbase SOL-USD spot price.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'YES',
                price: 41,
                amount: '$3.1K',
                time: '3m ago',
                trader: '0x7d4e...a2b8',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'YES',
                price: 40,
                amount: '$1.7K',
                time: '7m ago',
                trader: '0xe8f2...c1d5',
            },
            {
                id: 'rt-3',
                side: 'SELL',
                outcome: 'NO',
                price: 59,
                amount: '$2.3K',
                time: '14m ago',
                trader: '0x4a3b...f9e2',
            },
            {
                id: 'rt-4',
                side: 'BUY',
                outcome: 'NO',
                price: 60,
                amount: '$800',
                time: '19m ago',
                trader: '0xb6c1...d7a3',
            },
        ],
        relatedMarketIds: ['mk-001', 'mk-005', 'mk-008'],
    },
    {
        id: 'mc-001',
        slug: 'fifa-world-cup-2026',
        title: 'Who will win the 2026 FIFA World Cup?',
        category: 'SPORTS',
        status: 'live',
        type: 'multi-candidate',
        description:
            'This market resolves to the national team that wins the 2026 FIFA World Cup Final. The tournament is hosted jointly by Canada, Mexico, and the United States.',
        endDate: 'JUL 19, 2026',
        resolutionDate: 'JUL 20, 2026',
        createdDate: 'JAN 15, 2026',
        volume: '$8.2M',
        liquidity: '$1.4M',
        traders: 5420,
        trend: 'up',
        change24h: 1.4,
        outcomes: [
            { id: 'o-1', label: 'Brazil', probability: 22, volume: '$1.8M', change: 1.4 },
            { id: 'o-2', label: 'France', probability: 19, volume: '$1.6M', change: -0.8 },
            { id: 'o-3', label: 'Argentina', probability: 17, volume: '$1.4M', change: 2.1 },
            { id: 'o-4', label: 'Germany', probability: 12, volume: '$980K', change: 0.3 },
            { id: 'o-5', label: 'England', probability: 10, volume: '$820K', change: -1.2 },
            { id: 'o-6', label: 'Spain', probability: 9, volume: '$740K', change: 0.6 },
            { id: 'o-7', label: 'Other', probability: 11, volume: '$840K', change: -2.4 },
        ],
        priceHistory: [
            { date: 'JAN 15', value: 18 },
            { date: 'FEB 01', value: 19 },
            { date: 'FEB 15', value: 20 },
            { date: 'MAR 01', value: 19 },
            { date: 'MAR 15', value: 21 },
            { date: 'APR 01', value: 20 },
            { date: 'APR 15', value: 22 },
        ],
        rules: {
            yesCondition: 'The selected team wins the 2026 FIFA World Cup Final match.',
            noCondition: 'The selected team does not win the 2026 FIFA World Cup Final.',
            sourceOfTruth: 'Official FIFA match results.',
            additionalNotes:
                'Outcome determined by regulation time, extra time, and penalty shootout if applicable.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'Brazil',
                price: 22,
                amount: '$4.2K',
                time: '1m ago',
                trader: '0x9a3f...e1c7',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'Argentina',
                price: 17,
                amount: '$2.8K',
                time: '3m ago',
                trader: '0xd7b2...a4f9',
            },
            {
                id: 'rt-3',
                side: 'SELL',
                outcome: 'France',
                price: 19,
                amount: '$1.5K',
                time: '6m ago',
                trader: '0x2e8c...b3d1',
            },
            {
                id: 'rt-4',
                side: 'BUY',
                outcome: 'Germany',
                price: 12,
                amount: '$900',
                time: '10m ago',
                trader: '0xf1a4...c8e2',
            },
            {
                id: 'rt-5',
                side: 'SELL',
                outcome: 'England',
                price: 10,
                amount: '$3.1K',
                time: '15m ago',
                trader: '0x5b9d...f2a6',
            },
        ],
        relatedMarketIds: ['mk-003', 'mo-001', 'mc-002'],
    },
    {
        id: 'mo-001',
        slug: 'wti-crude-april-2026',
        title: 'What will WTI Crude Oil (WTI) hit in April 2026?',
        category: 'FINANCE',
        status: 'live',
        type: 'multi-option',
        description:
            'Each option in this market resolves independently based on whether WTI Crude Oil reaches the specified price level during April 2026.',
        endDate: 'APR 30, 2026',
        resolutionDate: 'MAY 01, 2026',
        createdDate: 'MAR 20, 2026',
        volume: '$6.7M',
        liquidity: '$1.1M',
        traders: 3180,
        trend: 'up',
        change24h: 4.2,
        outcomes: [
            { id: 'o-1', label: '> $85', probability: 63, volume: '$1.7M', change: 4.2 },
            { id: 'o-2', label: '> $90', probability: 92, volume: '$2.4M', change: 1.1 },
            { id: 'o-3', label: '> $80', probability: 31, volume: '$1.5M', change: -2.3 },
            { id: 'o-4', label: '> $75', probability: 12, volume: '$1.1M', change: -0.8 },
        ],
        priceHistory: [
            { date: 'MAR 20', value: 55 },
            { date: 'MAR 25', value: 58 },
            { date: 'MAR 30', value: 54 },
            { date: 'APR 04', value: 60 },
            { date: 'APR 09', value: 57 },
            { date: 'APR 14', value: 63 },
        ],
        rules: {
            yesCondition:
                'WTI Crude Oil front-month futures contract reaches the specified price level during April 2026.',
            noCondition:
                'WTI Crude Oil does not reach the specified price level during April 2026.',
            sourceOfTruth:
                'NYMEX WTI Crude Oil front-month futures settlement prices via CME Group.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: '> $85',
                price: 63,
                amount: '$5.1K',
                time: '30s ago',
                trader: '0xc2e9...a7b4',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: '> $90',
                price: 92,
                amount: '$2.2K',
                time: '2m ago',
                trader: '0x8f1d...e3c6',
            },
            {
                id: 'rt-3',
                side: 'SELL',
                outcome: '> $80',
                price: 31,
                amount: '$1.8K',
                time: '5m ago',
                trader: '0xa4b7...d9f2',
            },
            {
                id: 'rt-4',
                side: 'BUY',
                outcome: '> $85',
                price: 62,
                amount: '$3.4K',
                time: '9m ago',
                trader: '0x3d6e...c1a8',
            },
            {
                id: 'rt-5',
                side: 'SELL',
                outcome: '> $75',
                price: 12,
                amount: '$700',
                time: '14m ago',
                trader: '0xe7f3...b5d2',
            },
        ],
        relatedMarketIds: ['mo-002', 'mk-001', 'mk-004'],
    },
    {
        id: 'mo-002',
        slug: 'btc-price-range-june-2026',
        title: 'Bitcoin price range on June 30, 2026?',
        category: 'CRYPTO',
        status: 'live',
        type: 'multi-option',
        description:
            'This market resolves to the price bracket that contains the BTC/USD closing price at 11:59 PM UTC on June 30, 2026. Exactly one option will resolve YES.',
        endDate: 'JUN 28, 2026',
        resolutionDate: 'JUL 01, 2026',
        createdDate: 'MAR 05, 2026',
        volume: '$11.3M',
        liquidity: '$2.1M',
        traders: 7250,
        trend: 'up',
        change24h: 2.4,
        outcomes: [
            { id: 'o-1', label: '< $100K', probability: 15, volume: '$1.7M', change: -1.2 },
            { id: 'o-2', label: '$100K – $120K', probability: 33, volume: '$3.7M', change: 2.4 },
            { id: 'o-3', label: '$120K – $150K', probability: 35, volume: '$4.0M', change: 1.8 },
            { id: 'o-4', label: '> $150K', probability: 17, volume: '$1.9M', change: -3.0 },
        ],
        priceHistory: [
            { date: 'MAR 05', value: 28 },
            { date: 'MAR 12', value: 30 },
            { date: 'MAR 19', value: 27 },
            { date: 'MAR 26', value: 32 },
            { date: 'APR 02', value: 31 },
            { date: 'APR 09', value: 34 },
            { date: 'APR 16', value: 33 },
        ],
        rules: {
            yesCondition:
                'BTC/USD closing price on Coinbase falls within the selected price bracket at 11:59 PM UTC on June 30, 2026.',
            noCondition: 'BTC/USD closing price falls outside the selected bracket.',
            sourceOfTruth: 'Coinbase BTC-USD spot price.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: '$120K – $150K',
                price: 35,
                amount: '$6.2K',
                time: '1m ago',
                trader: '0xb8c4...d2e7',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: '< $100K',
                price: 15,
                amount: '$1.4K',
                time: '4m ago',
                trader: '0x5f9a...e1c3',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: '$100K – $120K',
                price: 33,
                amount: '$4.8K',
                time: '7m ago',
                trader: '0xa2d6...b8f4',
            },
            {
                id: 'rt-4',
                side: 'SELL',
                outcome: '> $150K',
                price: 17,
                amount: '$2.1K',
                time: '11m ago',
                trader: '0xc7e3...a4b9',
            },
        ],
        relatedMarketIds: ['mk-001', 'mk-004', 'mo-001'],
    },
    {
        id: 'mk-003',
        slug: 'lakers-nba-finals-2026',
        title: 'Lakers reach the 2026 NBA Finals?',
        category: 'SPORTS',
        status: 'live',
        type: 'yes-no',
        description:
            'Resolves YES if the Los Angeles Lakers appear in any game of the 2026 NBA Finals series.',
        endDate: 'MAY 30, 2026',
        resolutionDate: 'JUN 05, 2026',
        createdDate: 'APR 01, 2026',
        volume: '$640K',
        liquidity: '$180K',
        traders: 890,
        trend: 'down',
        change24h: -0.8,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 11, volume: '$70K', change: -0.8 },
            { id: 'o-2', label: 'NO', probability: 89, volume: '$570K', change: 0.8 },
        ],
        priceHistory: [
            { date: 'APR 01', value: 18 },
            { date: 'APR 05', value: 15 },
            { date: 'APR 10', value: 14 },
            { date: 'APR 15', value: 11 },
        ],
        rules: {
            yesCondition:
                'The Los Angeles Lakers appear in at least one game of the 2026 NBA Finals.',
            noCondition: 'The Lakers are eliminated before the NBA Finals.',
            sourceOfTruth: 'Official NBA playoff bracket and results.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'SELL',
                outcome: 'YES',
                price: 11,
                amount: '$400',
                time: '6m ago',
                trader: '0x4a1b...c9d3',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'NO',
                price: 89,
                amount: '$1.2K',
                time: '14m ago',
                trader: '0xe7f8...a2b5',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: 'NO',
                price: 88,
                amount: '$800',
                time: '28m ago',
                trader: '0x9c3d...f1e4',
            },
        ],
        relatedMarketIds: ['mc-001', 'mk-007', 'mk-006'],
    },
    {
        id: 'mc-002',
        slug: 'next-x-ceo',
        title: 'Next Twitter / X CEO after Elon Musk?',
        category: 'TECH',
        status: 'live',
        type: 'multi-candidate',
        description:
            'This market resolves to the person who is officially announced as the next CEO of X (formerly Twitter) after Elon Musk steps down or is replaced.',
        endDate: 'DEC 31, 2026',
        resolutionDate: 'JAN 05, 2027',
        createdDate: 'FEB 01, 2026',
        volume: '$2.1M',
        liquidity: '$380K',
        traders: 1890,
        trend: 'up',
        change24h: 4.1,
        outcomes: [
            { id: 'o-1', label: 'Linda Yaccarino', probability: 35, volume: '$735K', change: -2.0 },
            { id: 'o-2', label: 'Jason Calacanis', probability: 18, volume: '$378K', change: 4.1 },
            { id: 'o-3', label: 'David Sacks', probability: 14, volume: '$294K', change: 1.5 },
            { id: 'o-4', label: 'Sriram Krishnan', probability: 11, volume: '$231K', change: 0.8 },
            { id: 'o-5', label: 'Other', probability: 22, volume: '$462K', change: -4.4 },
        ],
        priceHistory: [
            { date: 'FEB 01', value: 38 },
            { date: 'FEB 15', value: 36 },
            { date: 'MAR 01', value: 37 },
            { date: 'MAR 15', value: 34 },
            { date: 'APR 01', value: 35 },
        ],
        rules: {
            yesCondition: 'The selected person is officially announced as CEO of X Corp.',
            noCondition:
                'Someone else is named CEO, or no CEO change occurs by the resolution date.',
            sourceOfTruth: 'Official X Corp / Twitter press release or SEC filing.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'Jason Calacanis',
                price: 18,
                amount: '$2.1K',
                time: '2m ago',
                trader: '0xf4a8...b7c2',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: 'Linda Yaccarino',
                price: 35,
                amount: '$1.6K',
                time: '8m ago',
                trader: '0x3e9d...c4f1',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: 'David Sacks',
                price: 14,
                amount: '$900',
                time: '16m ago',
                trader: '0xb2c5...a8d7',
            },
        ],
        relatedMarketIds: ['mk-005', 'mk-008', 'mc-001'],
    },
    {
        id: 'mk-005',
        slug: 'gpt-6-before-august-2026',
        title: 'OpenAI releases GPT-6 before August 2026?',
        category: 'TECH',
        status: 'live',
        type: 'yes-no',
        description:
            'This market resolves YES if OpenAI publicly releases or announces general availability of a model officially named "GPT-6" before August 1, 2026.',
        endDate: 'JUL 28, 2026',
        resolutionDate: 'AUG 01, 2026',
        createdDate: 'FEB 20, 2026',
        volume: '$1.1M',
        liquidity: '$290K',
        traders: 744,
        trend: 'up',
        change24h: 1.3,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 19, volume: '$209K', change: 1.3 },
            { id: 'o-2', label: 'NO', probability: 81, volume: '$891K', change: -1.3 },
        ],
        priceHistory: [
            { date: 'FEB 20', value: 12 },
            { date: 'MAR 05', value: 14 },
            { date: 'MAR 20', value: 16 },
            { date: 'APR 05', value: 18 },
            { date: 'APR 15', value: 19 },
        ],
        rules: {
            yesCondition:
                'OpenAI publicly announces or releases a model named "GPT-6" before August 1, 2026.',
            noCondition: 'No model named "GPT-6" is released by OpenAI before the deadline.',
            sourceOfTruth: 'Official OpenAI blog post or press release.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'YES',
                price: 19,
                amount: '$600',
                time: '5m ago',
                trader: '0xa1b2...c3d4',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'NO',
                price: 81,
                amount: '$2.4K',
                time: '12m ago',
                trader: '0xe5f6...a7b8',
            },
            {
                id: 'rt-3',
                side: 'SELL',
                outcome: 'YES',
                price: 18,
                amount: '$1.1K',
                time: '20m ago',
                trader: '0xc9d0...e1f2',
            },
        ],
        relatedMarketIds: ['mk-008', 'mc-002', 'mk-001'],
    },
    {
        id: 'mk-006',
        slug: 'ukraine-ceasefire-2026',
        title: 'Ukraine ceasefire agreed before September?',
        category: 'GEOPOLITICS',
        status: 'live',
        type: 'yes-no',
        description:
            'Resolves YES if an official ceasefire agreement between Ukraine and Russia is signed before September 1, 2026.',
        endDate: 'AUG 28, 2026',
        resolutionDate: 'SEP 01, 2026',
        createdDate: 'JAN 20, 2026',
        volume: '$5.8M',
        liquidity: '$920K',
        traders: 3301,
        trend: 'up',
        change24h: 3.7,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 34, volume: '$1.97M', change: 3.7 },
            { id: 'o-2', label: 'NO', probability: 66, volume: '$3.83M', change: -3.7 },
        ],
        priceHistory: [
            { date: 'JAN 20', value: 15 },
            { date: 'FEB 05', value: 18 },
            { date: 'FEB 20', value: 22 },
            { date: 'MAR 05', value: 25 },
            { date: 'MAR 20', value: 28 },
            { date: 'APR 05', value: 31 },
            { date: 'APR 15', value: 34 },
        ],
        rules: {
            yesCondition:
                'An official ceasefire agreement is signed by representatives of Ukraine and Russia before September 1, 2026.',
            noCondition: 'No ceasefire agreement is signed before the deadline.',
            sourceOfTruth:
                'United Nations or major wire services (AP, Reuters) reporting on a signed agreement.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'YES',
                price: 34,
                amount: '$5.2K',
                time: '1m ago',
                trader: '0xd4e5...f6a7',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: 'NO',
                price: 66,
                amount: '$3.8K',
                time: '4m ago',
                trader: '0xb8c9...d0e1',
            },
            {
                id: 'rt-3',
                side: 'BUY',
                outcome: 'YES',
                price: 33,
                amount: '$2.1K',
                time: '9m ago',
                trader: '0xf2a3...b4c5',
            },
        ],
        relatedMarketIds: ['mk-002', 'mk-003', 'mo-001'],
    },
    {
        id: 'mk-007',
        slug: 'taylor-swift-album-may-2026',
        title: 'Taylor Swift announces new album in May?',
        category: 'CULTURE',
        status: 'live',
        type: 'yes-no',
        description:
            'Resolves YES if Taylor Swift officially announces a new studio album (not a re-recording) during May 2026.',
        endDate: 'MAY 30, 2026',
        resolutionDate: 'JUN 01, 2026',
        createdDate: 'APR 10, 2026',
        volume: '$420K',
        liquidity: '$95K',
        traders: 620,
        trend: 'down',
        change24h: -1.4,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 57, volume: '$240K', change: -1.4 },
            { id: 'o-2', label: 'NO', probability: 43, volume: '$180K', change: 1.4 },
        ],
        priceHistory: [
            { date: 'APR 10', value: 62 },
            { date: 'APR 13', value: 60 },
            { date: 'APR 15', value: 57 },
        ],
        rules: {
            yesCondition:
                'Taylor Swift makes an official announcement of a new studio album during May 2026.',
            noCondition: 'No new album announcement from Taylor Swift during May 2026.',
            sourceOfTruth:
                'Official Taylor Swift social media accounts or record label press release.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'SELL',
                outcome: 'YES',
                price: 57,
                amount: '$350',
                time: '8m ago',
                trader: '0xa5b6...c7d8',
            },
            {
                id: 'rt-2',
                side: 'BUY',
                outcome: 'NO',
                price: 43,
                amount: '$600',
                time: '22m ago',
                trader: '0xe9f0...a1b2',
            },
        ],
        relatedMarketIds: ['mk-003', 'mc-001', 'mk-005'],
    },
    {
        id: 'mk-008',
        slug: 'starship-orbital-q2-2026',
        title: 'SpaceX Starship full orbital flight in Q2?',
        category: 'TECH',
        status: 'live',
        type: 'yes-no',
        description:
            'Resolves YES if SpaceX Starship completes a full orbital trajectory and controlled re-entry/landing before July 1, 2026.',
        endDate: 'JUN 28, 2026',
        resolutionDate: 'JUL 01, 2026',
        createdDate: 'MAR 01, 2026',
        volume: '$1.6M',
        liquidity: '$340K',
        traders: 990,
        trend: 'up',
        change24h: 2.9,
        outcomes: [
            { id: 'o-1', label: 'YES', probability: 48, volume: '$768K', change: 2.9 },
            { id: 'o-2', label: 'NO', probability: 52, volume: '$832K', change: -2.9 },
        ],
        priceHistory: [
            { date: 'MAR 01', value: 35 },
            { date: 'MAR 15', value: 38 },
            { date: 'MAR 29', value: 42 },
            { date: 'APR 12', value: 45 },
            { date: 'APR 17', value: 48 },
        ],
        rules: {
            yesCondition:
                'SpaceX Starship achieves a complete orbital trajectory and controlled re-entry before July 1, 2026.',
            noCondition: 'Starship does not complete a full orbital flight before the deadline.',
            sourceOfTruth: 'Official SpaceX communications and FAA launch records.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: 'YES',
                price: 48,
                amount: '$1.8K',
                time: '3m ago',
                trader: '0xc3d4...e5f6',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: 'NO',
                price: 52,
                amount: '$1.2K',
                time: '10m ago',
                trader: '0xa7b8...c9d0',
            },
        ],
        relatedMarketIds: ['mk-005', 'mk-001', 'mc-002'],
    },
    {
        id: 'mo-003',
        slug: 'global-temp-anomaly-2026',
        title: 'Global average temperature anomaly in 2026?',
        category: 'SCIENCE',
        status: 'live',
        type: 'multi-option',
        description:
            'This market resolves to the annual global mean surface temperature anomaly for 2026 relative to the 1850–1900 baseline, as reported by NASA GISS.',
        endDate: 'DEC 28, 2026',
        resolutionDate: 'JAN 15, 2027',
        createdDate: 'JAN 10, 2026',
        volume: '$1.4M',
        liquidity: '$240K',
        traders: 820,
        trend: 'up',
        change24h: 1.2,
        outcomes: [
            { id: 'o-1', label: '< +1.3°C', probability: 8, volume: '$112K', change: -0.5 },
            { id: 'o-2', label: '+1.3°C to +1.5°C', probability: 42, volume: '$588K', change: 1.2 },
            {
                id: 'o-3',
                label: '+1.5°C to +1.7°C',
                probability: 38,
                volume: '$532K',
                change: -0.9,
            },
            { id: 'o-4', label: '> +1.7°C', probability: 12, volume: '$168K', change: 0.2 },
        ],
        priceHistory: [
            { date: 'JAN 10', value: 35 },
            { date: 'FEB 01', value: 38 },
            { date: 'MAR 01', value: 40 },
            { date: 'APR 01', value: 42 },
        ],
        rules: {
            yesCondition:
                'The annual global mean surface temperature anomaly falls within the selected range.',
            noCondition: 'The anomaly falls outside the selected range.',
            sourceOfTruth:
                'NASA Goddard Institute for Space Studies (GISS) annual temperature analysis.',
        },
        recentTrades: [
            {
                id: 'rt-1',
                side: 'BUY',
                outcome: '+1.3°C to +1.5°C',
                price: 42,
                amount: '$1.2K',
                time: '5m ago',
                trader: '0xf1e2...d3c4',
            },
            {
                id: 'rt-2',
                side: 'SELL',
                outcome: '+1.5°C to +1.7°C',
                price: 38,
                amount: '$800',
                time: '12m ago',
                trader: '0xb5a6...e7f8',
            },
        ],
        relatedMarketIds: ['mo-001', 'mo-002', 'mk-006'],
    },
];

export function getMarketBySlug(slug: string): MarketDetail | undefined {
    return marketDetails.find((m) => m.slug === slug);
}

export function getMarketById(id: string): MarketDetail | undefined {
    return marketDetails.find((m) => m.id === id);
}

export function getRelatedMarkets(ids: string[]): MarketDetail[] {
    return ids
        .map((id) => marketDetails.find((m) => m.id === id))
        .filter(Boolean) as MarketDetail[];
}

export const hotTopics: HotTopic[] = [
    {
        id: 'ht-001',
        rank: 1,
        title: 'US x Iran peace deal',
        category: 'GEOPOLITICS',
        volume: '$4.2M',
        traders: 2148,
    },
    {
        id: 'ht-002',
        rank: 2,
        title: 'Ukraine ceasefire',
        category: 'GEOPOLITICS',
        volume: '$5.8M',
        traders: 3301,
    },
    {
        id: 'ht-003',
        rank: 3,
        title: 'Fed June rate decision',
        category: 'POLITICS',
        volume: '$3.4M',
        traders: 1820,
    },
    {
        id: 'ht-004',
        rank: 4,
        title: 'SOL Q2 price target',
        category: 'CRYPTO',
        volume: '$2.7M',
        traders: 1502,
    },
    {
        id: 'ht-005',
        rank: 5,
        title: 'Starship orbital flight',
        category: 'TECH',
        volume: '$1.6M',
        traders: 990,
    },
    {
        id: 'ht-006',
        rank: 6,
        title: 'GPT-6 launch window',
        category: 'TECH',
        volume: '$1.1M',
        traders: 744,
    },
];

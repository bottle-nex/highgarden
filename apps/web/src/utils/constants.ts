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
    'TRENDING',
    'BREAKING',
    'NEW',
    'POLITICS',
    'SPORTS',
    'CRYPTO',
    'GEOPOLITICS',
    'CULTURE',
    'TECH',
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

export interface SeedMarket {
    id: string;
    question: string;
    description: string;
    endDate: string;
    volume24hr: number;
    liquidity: number;
    minimumTickSize: string;
    negRisk: boolean;
    tokens: [
        { tokenId: string; outcome: "Yes"; initialPriceCents: number },
        { tokenId: string; outcome: "No"; initialPriceCents: number },
    ];
}

const mk = (
    id: string,
    question: string,
    description: string,
    daysUntilEnd: number,
    volume24hr: number,
    liquidity: number,
    yesCents: number,
): SeedMarket => ({
    id,
    question,
    description,
    endDate: new Date(Date.now() + daysUntilEnd * 86_400_000).toISOString(),
    volume24hr,
    liquidity,
    minimumTickSize: "0.01",
    negRisk: false,
    tokens: [
        { tokenId: `${id}-YES`, outcome: "Yes", initialPriceCents: yesCents },
        { tokenId: `${id}-NO`, outcome: "No", initialPriceCents: 100 - yesCents },
    ],
});

export const SEED_MARKETS: SeedMarket[] = [
    mk(
        "btc-150k-2026",
        "Will Bitcoin close above $150,000 on December 31, 2026?",
        "Resolves YES if the BTC/USD closing price on Dec 31 2026 exceeds $150,000 according to CoinGecko.",
        260,
        1_842_100,
        950_000,
        42,
    ),
    mk(
        "eth-5k-2026",
        "Will Ethereum close above $5,000 on December 31, 2026?",
        "Resolves YES if the ETH/USD closing price on Dec 31 2026 exceeds $5,000 according to CoinGecko.",
        260,
        712_450,
        410_000,
        36,
    ),
    mk(
        "fed-cuts-june",
        "Will the Federal Reserve cut rates in June 2026?",
        "Resolves YES if the FOMC announces a rate cut at its June 2026 meeting.",
        65,
        2_103_500,
        1_200_000,
        58,
    ),
    mk(
        "us-recession-2026",
        "Will the US enter a recession in 2026?",
        "Resolves YES if the NBER declares a recession beginning in calendar year 2026.",
        360,
        520_000,
        280_000,
        22,
    ),
    mk(
        "gpt-5-release-2026",
        "Will OpenAI release GPT-5 before July 2026?",
        "Resolves YES if OpenAI publicly releases a model branded GPT-5 before 2026-07-01.",
        90,
        310_200,
        175_000,
        67,
    ),
    mk(
        "spacex-mars-2026",
        "Will SpaceX launch a crewed Mars mission in 2026?",
        "Resolves YES if SpaceX launches a crewed vehicle to Mars in 2026.",
        300,
        85_000,
        45_000,
        3,
    ),
    mk(
        "world-cup-brazil",
        "Will Brazil win the 2026 FIFA World Cup?",
        "Resolves YES if Brazil wins the 2026 FIFA World Cup final.",
        120,
        645_000,
        380_000,
        18,
    ),
    mk(
        "apple-car-2026",
        "Will Apple announce a car product in 2026?",
        "Resolves YES if Apple publicly announces a car or vehicle product in 2026.",
        200,
        128_000,
        72_000,
        8,
    ),
];

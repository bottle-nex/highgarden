import type { Chain, HedgeStatus, MarketStatus, Outcome, Side } from "./enums.prisma";
import type { User } from "./user.prisma";

export interface Market {
    id: string;
    name: string;
    description: string;

    solanaMarketPda: string | null;

    polyMarketId: string;
    polymarket?: PolyMarket;

    status: MarketStatus;
    winningOutcome: Outcome | null;

    createdAt: Date;
    endAt: Date;
    resolvedAt: Date | null;

    quotes?: Quote[];
    fills?: Fill[];
    exposure?: Exposure | null;
}

export interface PolyMarket {
    id: string;
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;

    market?: Market | null;
}

export interface Quote {
    nonce: string;
    marketId: string;
    market?: Market;
    side: Side;
    outcome: Outcome;
    price: number;
    size: number;
    expiresAt: Date;
    signature: string;
    consumed: boolean;
    createdAt: Date;

    fill?: Fill | null;
}

export interface Fill {
    id: string;
    userId: string;
    user?: User;
    marketId: string;
    market?: Market;

    side: Side;
    outcome: Outcome;
    price: number;
    size: number;

    solanaTxSig: string;
    nonce: string | null;
    quote?: Quote | null;

    createdAt: Date;

    hedge?: Hedge | null;
}

export interface Hedge {
    id: string;
    fillId: string;
    fill?: Fill;

    polymarketOrderId: string | null;
    status: HedgeStatus;
    filledSize: number;
    avgPrice: number | null;
    attempts: number;
    lastError: string | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface Exposure {
    marketId: string;
    market?: Market;
    unhedgedUsd: number;
    updatedAt: Date;
}

export interface TreasuryBalance {
    chain: Chain;
    token: string;
    amount: bigint;
    updatedAt: Date;
}

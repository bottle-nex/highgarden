import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'How it works',
    description: `A walkthrough of how ${APP_NAME} prediction markets work — from picking a market to claiming a settled position.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'overview',
        title: 'What is a prediction market?',
        eyebrow: 'OVERVIEW',
        body: (
            <>
                <p>
                    A prediction market is a marketplace for buying and selling shares in the
                    outcome of a future event. Each market on {APP_NAME} resolves to either YES or
                    NO based on a publicly defined source of truth. Share prices reflect the
                    market&apos;s collective estimate of the probability of the event occurring.
                </p>
                <p>
                    A YES share priced at $0.62 means the market is implying a 62% probability of
                    YES. If the event resolves YES, every YES share pays out $1.00. If it resolves
                    NO, YES shares pay $0.00 and NO shares pay $1.00.
                </p>
            </>
        ),
    },
    {
        id: 'pick-a-market',
        title: 'Pick a market',
        eyebrow: 'STEP ONE',
        body: (
            <>
                <p>
                    Browse markets across politics, crypto, sports, geopolitics, culture, tech, and
                    more. Every market has a public rule set that defines exactly what triggers a
                    YES vs. NO resolution and the source used to determine the outcome.
                </p>
                <p>
                    Read the rules in full before placing a trade. Once a market is live, the rules
                    cannot be changed.
                </p>
            </>
        ),
    },
    {
        id: 'get-a-quote',
        title: 'Get a quote',
        eyebrow: 'STEP TWO',
        body: (
            <>
                <p>
                    The order book shows the current bid and ask for YES and NO shares. Enter the
                    side and size you want and {APP_NAME} will quote a fill price based on available
                    liquidity. Larger orders may fill across multiple price levels.
                </p>
                <p>
                    Trades settle in USDC on Solana. The Solana network fee (gas) is paid in SOL by
                    the wallet signing the transaction.
                </p>
            </>
        ),
    },
    {
        id: 'place-the-trade',
        title: 'Place the trade',
        eyebrow: 'STEP THREE',
        body: (
            <>
                <p>
                    Connect a Solana wallet, approve the transaction, and the position is recorded
                    on-chain. {APP_NAME} is non-custodial — your USDC is held by the market
                    contract, not by us, and the position is owned by the wallet that signed the
                    trade.
                </p>
                <p>
                    You can exit the position any time before the market closes by selling your
                    shares back into the order book at the prevailing price.
                </p>
            </>
        ),
    },
    {
        id: 'real-time-prices',
        title: 'Watch prices in real time',
        eyebrow: 'WHILE OPEN',
        body: (
            <>
                <p>
                    Prices move as new traders enter, news breaks, or the underlying event unfolds.
                    The price chart shows the implied probability over the lifetime of the market.
                    Volume, open interest, and recent trades are all visible from the market page.
                </p>
            </>
        ),
    },
    {
        id: 'resolution',
        title: 'Resolution',
        eyebrow: 'WHEN THE EVENT HAPPENS',
        body: (
            <>
                <p>
                    When the source of truth confirms the outcome, the market resolves on-chain.
                    Winning shares become redeemable for $1.00 each in USDC; losing shares are worth
                    $0.00.
                </p>
                <p>
                    For the rare cases where the source of truth is unavailable, ambiguous, or
                    compromised, {APP_NAME} applies a documented fallback procedure that can include
                    market invalidation and a pro-rata refund of stake.
                </p>
            </>
        ),
    },
    {
        id: 'claim',
        title: 'Claim your payout',
        eyebrow: 'STEP FOUR',
        body: (
            <>
                <p>
                    Once a market is resolved, winning positions are claimable from the portfolio
                    page. Sign the claim transaction and the USDC is sent directly to your wallet.
                    There is no holding period and no off-chain settlement layer.
                </p>
            </>
        ),
    },
    {
        id: 'fees',
        title: 'Fees',
        eyebrow: 'COSTS',
        body: (
            <>
                <p>
                    {APP_NAME} charges a protocol fee on filled orders and on settlement payouts.
                    The current fee schedule is published on the trading interface and applies
                    uniformly to all participants. Solana network fees (gas) are paid in SOL at
                    transaction time.
                </p>
            </>
        ),
    },
    {
        id: 'next-steps',
        title: 'Next steps',
        eyebrow: 'KEEP READING',
        body: (
            <>
                <p>
                    See the <a href="/faq">FAQ</a> for common questions, the{' '}
                    <a href="/docs/resolution">Resolution Sources</a> page for how each category
                    resolves, and the <a href="/legal/risk-disclosure">Risk Disclosure</a> for what
                    can go wrong.
                </p>
            </>
        ),
    },
];

export default function HowItWorksPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEARN · HOW IT WORKS"
            title="How it works"
            description={`Four steps from "I have a view" to "I just claimed my payout." Everything settles on Solana, in USDC, with public rules.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

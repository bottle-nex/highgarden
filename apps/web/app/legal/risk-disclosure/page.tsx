import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Risk Disclosure',
    description: `The risks of trading on ${APP_NAME} — total loss, smart contract risk, oracle risk, and more.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'read-this-first',
        title: 'Read this first',
        eyebrow: 'IMPORTANT',
        body: (
            <>
                <p>
                    Trading on {APP_NAME} is speculative and risky. You can lose the entire amount
                    you stake on any position. Do not trade with funds you cannot afford to lose.
                    This page lists the principal risks you accept by using the Services. It is not
                    exhaustive.
                </p>
            </>
        ),
    },
    {
        id: 'total-loss',
        title: 'Total loss of stake',
        eyebrow: 'CAPITAL RISK',
        body: (
            <>
                <p>
                    Each share you buy is a binary claim worth $1.00 on a winning outcome and $0.00
                    on a losing outcome. There is no partial credit. If the outcome you bet on does
                    not occur, you lose 100% of the amount staked on that side.
                </p>
            </>
        ),
    },
    {
        id: 'price-risk',
        title: 'Price volatility',
        eyebrow: 'MARK-TO-MARKET',
        body: (
            <>
                <p>
                    Share prices reflect market sentiment and can move sharply against you on news,
                    illiquid hours, or large orders. Selling out of a position before resolution may
                    realize a loss even if the eventual outcome would have been favorable. Prices
                    are not a guarantee of probability.
                </p>
            </>
        ),
    },
    {
        id: 'smart-contract-risk',
        title: 'Smart contract risk',
        eyebrow: 'CODE RISK',
        body: (
            <>
                <p>
                    Trades, escrow, and settlement run on Solana smart contracts. Bugs, exploits, or
                    unexpected interactions could result in loss of funds, frozen positions, or
                    incorrect resolution. Audits reduce — but do not eliminate — this risk.
                </p>
            </>
        ),
    },
    {
        id: 'oracle-and-resolution-risk',
        title: 'Oracle and resolution risk',
        eyebrow: 'SOURCE OF TRUTH',
        body: (
            <>
                <p>
                    Each market relies on an external source of truth. The source can be delayed,
                    inaccurate, manipulated, or temporarily unavailable. The fallback procedure
                    documented for each market may invalidate the market and refund stake on a
                    pro-rata basis, which is not the same as receiving a winning payout you
                    expected.
                </p>
            </>
        ),
    },
    {
        id: 'network-risk',
        title: 'Network and infrastructure risk',
        eyebrow: 'OUTAGES',
        body: (
            <>
                <p>
                    The Services depend on the Solana network, RPC providers, wallets, and the USDC
                    issuer. Outages, congestion, hard forks, censorship, USDC depeg, or freeze-list
                    enforcement can prevent you from entering, exiting, or settling positions on the
                    timeline you expected.
                </p>
            </>
        ),
    },
    {
        id: 'wallet-risk',
        title: 'Wallet and key risk',
        eyebrow: 'YOU HOLD THE KEYS',
        body: (
            <>
                <p>
                    {APP_NAME} is non-custodial. If your wallet is compromised, your seed phrase is
                    leaked, or you sign a malicious transaction, your funds can be moved or stolen.{' '}
                    {APP_NAME} cannot reverse transactions, recover keys, or restore lost funds.
                </p>
            </>
        ),
    },
    {
        id: 'regulatory-risk',
        title: 'Regulatory risk',
        eyebrow: 'CHANGING RULES',
        body: (
            <>
                <p>
                    Prediction markets and tokenized derivatives are regulated differently across
                    jurisdictions and the rules are evolving. Future regulatory action — including
                    geo-blocking, listing requirements, or asset freezes — could affect the
                    availability of the Services or the value of open positions.
                </p>
            </>
        ),
    },
    {
        id: 'liquidity-risk',
        title: 'Liquidity risk',
        eyebrow: 'GETTING OUT',
        body: (
            <>
                <p>
                    You may not be able to exit a position at the price you want, or at all,
                    particularly in thinly traded markets, near resolution, or during periods of
                    market stress. Quoted prices reflect best available liquidity and can move
                    against you when you place an order.
                </p>
            </>
        ),
    },
    {
        id: 'tax-risk',
        title: 'Tax risk',
        eyebrow: 'YOUR RESPONSIBILITY',
        body: (
            <>
                <p>
                    Trading on {APP_NAME} may have tax consequences. {APP_NAME} does not issue tax
                    forms and is not your tax advisor. Consult a qualified tax professional in your
                    jurisdiction before trading meaningful size.
                </p>
            </>
        ),
    },
    {
        id: 'no-warranty',
        title: 'No warranty',
        eyebrow: 'AS-IS',
        body: (
            <>
                <p>
                    The Services are provided &ldquo;as is&rdquo; without warranty of any kind. By
                    using the Services you acknowledge the risks above and agree to the{' '}
                    <a href="/legal/terms">Terms of Service</a>.
                </p>
            </>
        ),
    },
];

export default function RiskDisclosurePage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEGAL · RISK DISCLOSURE"
            title="Risk Disclosure"
            description={`Prediction markets are speculative. This page lists the main ways a position on ${APP_NAME} can go wrong.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

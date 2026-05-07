import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Disclosures',
    description: `Material disclosures about ${APP_NAME} — protocol design, conflicts, sourcing, and limitations.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'nature-of-the-product',
        title: 'Nature of the product',
        eyebrow: 'WHAT THIS IS',
        body: (
            <>
                <p>
                    {APP_NAME} is a peer-to-peer prediction market protocol on Solana. {APP_NAME}{' '}
                    operates the front-end interface and certain off-chain infrastructure (indexing,
                    APIs, market creation tooling). The matching, escrow, and settlement of trades
                    happens on-chain via smart contracts.
                </p>
                <p>
                    {APP_NAME} is not a broker-dealer, exchange, futures commission merchant,
                    designated contract market, or money services business. {APP_NAME} does not take
                    custody of user funds and does not act as counterparty to user trades.
                </p>
            </>
        ),
    },
    {
        id: 'no-investment-advice',
        title: 'No investment advice',
        eyebrow: 'IMPORTANT',
        body: (
            <>
                <p>
                    Nothing on the Services constitutes investment, legal, tax, or financial advice.
                    Market prices, charts, statistics, and any commentary are provided for
                    information only. You are solely responsible for evaluating the merits and risks
                    of any position before placing a trade.
                </p>
            </>
        ),
    },
    {
        id: 'liquidity-and-market-making',
        title: 'Liquidity and market making',
        eyebrow: 'WHO IS ON THE OTHER SIDE',
        body: (
            <>
                <p>
                    Liquidity on {APP_NAME} is provided by independent third-party market makers and
                    other users of the protocol. {APP_NAME} or its affiliates may also provide
                    liquidity from time to time. Where {APP_NAME} or an affiliate has positions in a
                    market, that fact is disclosed on the market page.
                </p>
            </>
        ),
    },
    {
        id: 'data-sources',
        title: 'Data sources and oracles',
        eyebrow: 'SOURCING',
        body: (
            <>
                <p>
                    Each market specifies the source of truth used for resolution. Sources may
                    include public APIs, official press releases, government filings, exchange
                    settlement prices, league results, or designated oracle networks. The full list
                    by category is published on the{' '}
                    <a href="/docs/resolution">Resolution Sources</a> page.
                </p>
                <p>
                    {APP_NAME} does not control these sources and is not responsible for their
                    accuracy, availability, or timing.
                </p>
            </>
        ),
    },
    {
        id: 'fees-and-conflicts',
        title: 'Fees, rebates, and conflicts',
        eyebrow: 'TRANSPARENCY',
        body: (
            <>
                <p>
                    {APP_NAME} earns revenue from a protocol fee on filled orders and on settlement
                    payouts. Market makers may receive rebates or other incentives that are
                    disclosed in the published fee schedule.
                </p>
                <p>
                    {APP_NAME} has discretion over which markets are listed, featured, or delisted.
                    Listing decisions are made on commercial and policy grounds and may not align
                    with the interests of every participant.
                </p>
            </>
        ),
    },
    {
        id: 'protocol-and-network-risk',
        title: 'Protocol and network risk',
        eyebrow: 'KNOWN LIMITATIONS',
        body: (
            <>
                <p>
                    The Services depend on the Solana network, RPC providers, the USDC issuer, and
                    third-party wallets. Outages, congestion, hard forks, depegs, or freezes in any
                    of these components can prevent trades from being placed, exited, or settled on
                    time. {APP_NAME} does not guarantee uptime or settlement timing.
                </p>
                <p>
                    Smart contracts can contain bugs. Audit reports are published in the
                    documentation; users should review them before depositing meaningful capital.
                </p>
            </>
        ),
    },
    {
        id: 'forward-looking-statements',
        title: 'Forward-looking statements',
        eyebrow: 'CAVEAT',
        body: (
            <>
                <p>
                    Materials describing planned features, roadmaps, or upcoming markets are
                    forward-looking and subject to change without notice. {APP_NAME} is under no
                    obligation to update or revise such statements.
                </p>
            </>
        ),
    },
    {
        id: 'contact',
        title: 'Contact',
        eyebrow: 'QUESTIONS',
        body: (
            <>
                <p>
                    Disclosure questions can be sent to{' '}
                    <a href="mailto:legal@solmarket.xyz">legal@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
];

export default function DisclosuresPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEGAL · DISCLOSURES"
            title="Disclosures"
            description={`Material facts about how ${APP_NAME} operates, where conflicts may arise, and what we do not warrant.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

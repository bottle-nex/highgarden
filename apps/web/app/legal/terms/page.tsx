import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Terms of Service',
    description: `The terms governing your use of ${APP_NAME}, a Solana-native prediction market.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'introduction',
        title: 'Introduction',
        eyebrow: 'OVERVIEW',
        body: (
            <>
                <p>
                    These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to and use
                    of the {APP_NAME} protocol, websites, smart contracts, APIs, and any related
                    services (collectively, the &ldquo;Services&rdquo;). {APP_NAME} is a
                    Solana-native prediction market that allows eligible users to trade YES/NO
                    outcomes on real-world events, settled in USDC on Solana.
                </p>
                <p>
                    By connecting a wallet, signing a transaction, or otherwise interacting with
                    the Services, you agree to be bound by these Terms. If you do not agree, do
                    not use the Services.
                </p>
            </>
        ),
    },
    {
        id: 'eligibility',
        title: 'Eligibility',
        eyebrow: 'WHO CAN TRADE',
        body: (
            <>
                <p>
                    You may use the Services only if you are at least 18 years old (or the age of
                    majority in your jurisdiction, whichever is greater), have full legal capacity
                    to enter into binding agreements, and are not a person barred from trading on
                    prediction markets under applicable law.
                </p>
                <p>
                    You represent that you are not located in, organized under the laws of, or a
                    resident of any jurisdiction listed in the section titled
                    &ldquo;Prohibited Jurisdictions&rdquo; and that you are not subject to any
                    sanctions list maintained by the U.S. Office of Foreign Assets Control (OFAC),
                    the European Union, the United Kingdom, or the United Nations.
                </p>
            </>
        ),
    },
    {
        id: 'accounts-and-wallets',
        title: 'Accounts and wallets',
        eyebrow: 'KEYS & CUSTODY',
        body: (
            <>
                <p>
                    The Services are non-custodial. Trades, deposits, and withdrawals are
                    initiated from a Solana wallet that you control. {APP_NAME} does not store,
                    hold, or have access to your private keys, seed phrases, or signing
                    credentials at any time.
                </p>
                <p>
                    You are solely responsible for the security of your wallet and any device you
                    use to access the Services. Any transaction signed by your wallet is
                    presumed to be authorized by you. {APP_NAME} cannot reverse, cancel, or
                    refund a transaction once it is confirmed on the Solana blockchain.
                </p>
            </>
        ),
    },
    {
        id: 'market-rules-and-resolution',
        title: 'Market rules and resolution',
        eyebrow: 'OUTCOMES',
        body: (
            <>
                <p>
                    Each market on {APP_NAME} is governed by a public rule set that defines the
                    YES condition, the NO condition, and the source of truth used to determine
                    the final outcome. The rules are visible on the market page before any trade
                    is placed and are immutable for the lifetime of the market.
                </p>
                <p>
                    Markets resolve when the source of truth confirms the outcome. In rare cases
                    where the source of truth is unavailable, ambiguous, or compromised,
                    {APP_NAME} may apply the documented fallback resolution procedure, which can
                    include market invalidation and pro-rata refund of stake to participants.
                </p>
                <p>
                    Resolution decisions are final. You acknowledge that the interpretation of
                    real-world events for the purposes of market resolution can be a judgment
                    call, and you accept the resolution mechanism described on each market page
                    as a condition of participating.
                </p>
            </>
        ),
    },
    {
        id: 'fees-and-settlement',
        title: 'Fees and settlement',
        eyebrow: 'COSTS',
        body: (
            <>
                <p>
                    Trades on {APP_NAME} are settled in USDC on Solana. Solana network fees
                    (&ldquo;gas&rdquo;) are paid by you in SOL at the time of signing.
                    {APP_NAME} may charge a protocol fee on filled orders or on settlement
                    payouts; the current fee schedule is published on the Services and may be
                    updated from time to time with reasonable notice.
                </p>
                <p>
                    Settlement of a winning position is performed by smart contract once the
                    market is resolved. You are responsible for claiming or withdrawing your
                    settled USDC to your wallet. {APP_NAME} does not guarantee delivery of funds
                    to addresses that are sanctioned, blacklisted by the USDC issuer, or
                    otherwise subject to enforcement action.
                </p>
            </>
        ),
    },
    {
        id: 'risk-disclosure',
        title: 'Risk disclosure',
        eyebrow: 'KNOW THE RISK',
        body: (
            <>
                <p>
                    Prediction markets are speculative. You can lose the entire amount you stake
                    on any position. Prices reflect market sentiment, not the actual probability
                    of an outcome, and can move sharply against you. Do not trade with funds you
                    cannot afford to lose.
                </p>
                <p>
                    Additional risks include, without limitation: smart contract risk, oracle
                    risk, network congestion or downtime on Solana, depeg or freezing of USDC,
                    wallet compromise, regulatory changes affecting the legality of prediction
                    markets in your jurisdiction, and resolution disputes. {APP_NAME} does not
                    provide investment, legal, tax, or financial advice.
                </p>
            </>
        ),
    },
    {
        id: 'prohibited-conduct',
        title: 'Prohibited conduct',
        eyebrow: 'NOT ALLOWED',
        body: (
            <>
                <p>
                    When using the Services, you agree not to: (a) engage in market manipulation,
                    wash trading, spoofing, or any conduct designed to create false or misleading
                    appearances of trading activity; (b) trade on the basis of material
                    non-public information that the source of truth has not yet released;
                    (c) attempt to interfere with, disrupt, or compromise the Services, the
                    underlying smart contracts, or the Solana network; (d) use the Services to
                    launder funds, evade sanctions, or finance illegal activity; or (e) misuse,
                    scrape, or reverse-engineer the Services beyond what is permitted by
                    applicable law.
                </p>
            </>
        ),
    },
    {
        id: 'prohibited-jurisdictions',
        title: 'Prohibited jurisdictions',
        eyebrow: 'GEOGRAPHY',
        body: (
            <>
                <p>
                    The Services are not offered to, and may not be used by, persons located in
                    or residents of: the United States of America, the United Kingdom, Canada,
                    France, Singapore, Hong Kong, mainland China, North Korea, Iran, Syria, Cuba,
                    Russia, Belarus, the Crimea, Donetsk, and Luhansk regions, or any other
                    jurisdiction where the use of prediction markets or the trading of related
                    financial instruments is prohibited by applicable law (the &ldquo;Prohibited
                    Jurisdictions&rdquo;).
                </p>
                <p>
                    {APP_NAME} reserves the right to update the list of Prohibited Jurisdictions
                    at any time and to deny access to wallets that, in its reasonable judgment,
                    appear to originate from a Prohibited Jurisdiction.
                </p>
            </>
        ),
    },
    {
        id: 'intellectual-property',
        title: 'Intellectual property',
        eyebrow: 'BRAND & CODE',
        body: (
            <>
                <p>
                    The {APP_NAME} name, wordmark, logos, and the user interface assets on the
                    Services are the property of {APP_NAME} and its licensors. Open-source
                    components are made available under their respective licenses, which control
                    over these Terms with respect to those components.
                </p>
                <p>
                    Nothing in these Terms grants you any right or license to use the
                    {APP_NAME} brand or to imply endorsement, partnership, or affiliation
                    without prior written permission.
                </p>
            </>
        ),
    },
    {
        id: 'third-party-services',
        title: 'Third-party services',
        eyebrow: 'OUTSIDE LINKS',
        body: (
            <>
                <p>
                    The Services may rely on or link to third parties, including the Solana
                    network, RPC providers, wallet providers, oracle providers, the USDC issuer,
                    and the Polymarket-mirrored liquidity layer. {APP_NAME} does not control
                    these third parties and is not responsible for their availability, accuracy,
                    fees, or terms of service. Your use of any third-party service is at your own
                    risk and subject to the terms of that third party.
                </p>
            </>
        ),
    },
    {
        id: 'disclaimers-and-liability',
        title: 'Disclaimers and limitation of liability',
        eyebrow: 'AS-IS',
        body: (
            <>
                <p>
                    THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
                    WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR
                    OTHERWISE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                    PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. {APP_NAME} DOES NOT WARRANT
                    THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
                    COMPONENTS.
                </p>
                <p>
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {APP_NAME}, ITS
                    AFFILIATES, AND ITS PERSONNEL WILL NOT BE LIABLE FOR ANY INDIRECT,
                    INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
                    PROFITS, REVENUES, DATA, OR DIGITAL ASSETS, ARISING OUT OF OR IN CONNECTION
                    WITH YOUR USE OF THE SERVICES.
                </p>
            </>
        ),
    },
    {
        id: 'dispute-resolution',
        title: 'Dispute resolution and governing law',
        eyebrow: 'IF THINGS GO WRONG',
        body: (
            <>
                <p>
                    These Terms are governed by the laws of the British Virgin Islands, without
                    regard to conflict-of-laws principles. Any dispute arising out of or relating
                    to these Terms or the Services will be resolved by final and binding
                    arbitration administered under the rules of the International Chamber of
                    Commerce, seated in the British Virgin Islands, in the English language.
                </p>
                <p>
                    You agree to bring any claim only in your individual capacity and not as a
                    plaintiff or class member in any purported class or representative
                    proceeding.
                </p>
            </>
        ),
    },
    {
        id: 'modifications',
        title: 'Modifications to the Terms',
        eyebrow: 'CHANGES',
        body: (
            <>
                <p>
                    {APP_NAME} may modify these Terms at any time. Material changes will be
                    indicated by updating the &ldquo;Effective&rdquo; date at the top of this
                    page and, where appropriate, by additional notice on the Services. Your
                    continued use of the Services after the effective date of an updated version
                    constitutes acceptance of the revised Terms.
                </p>
            </>
        ),
    },
    {
        id: 'contact',
        title: 'Contact',
        eyebrow: 'GET IN TOUCH',
        body: (
            <>
                <p>
                    Questions about these Terms can be sent to{' '}
                    <a href="mailto:legal@solmarket.xyz">legal@solmarket.xyz</a>. For security
                    disclosures, please use{' '}
                    <a href="mailto:security@solmarket.xyz">security@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
];

export default function TermsPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEGAL · TERMS OF SERVICE"
            title="Terms of Service"
            description={`The rules of the road for using ${APP_NAME}. Please read carefully — by interacting with the protocol you agree to everything below.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

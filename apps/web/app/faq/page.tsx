import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'FAQ',
    description: `Answers to common questions about ${APP_NAME} — wallets, trading, resolution, fees, and more.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'getting-started',
        title: 'Getting started',
        eyebrow: 'BASICS',
        body: (
            <>
                <p>
                    <strong>Do I need an account?</strong> No. {APP_NAME} is non-custodial and
                    accessed through a Solana wallet. Connect a wallet and you can browse, trade,
                    and claim payouts. There is no signup form, no email, and no password.
                </p>
                <p>
                    <strong>What wallets are supported?</strong> Any standard Solana wallet —
                    Phantom, Backpack, Solflare, Glow, and any wallet that implements the Solana
                    Wallet Adapter spec.
                </p>
                <p>
                    <strong>Do I need SOL?</strong> Yes — a small amount for network fees (gas).
                    Trades themselves are denominated in USDC.
                </p>
            </>
        ),
    },
    {
        id: 'trading',
        title: 'Trading',
        eyebrow: 'HOW IT WORKS',
        body: (
            <>
                <p>
                    <strong>What does a $0.62 share price mean?</strong> The market is implying a
                    62% probability of YES. If you buy YES at $0.62 and the market resolves YES, you
                    receive $1.00 per share — a profit of $0.38 per share. If it resolves NO, you
                    receive $0.00.
                </p>
                <p>
                    <strong>Can I sell before resolution?</strong> Yes. You can exit any open
                    position by selling your shares back to the order book at the prevailing price.
                </p>
                <p>
                    <strong>What is the minimum trade size?</strong> One share, equivalent to less
                    than one USDC for most outcomes.
                </p>
                <p>
                    <strong>Are there limits on position size?</strong> Position size is bounded by
                    available liquidity in the order book at any given moment, not by a hard cap.
                </p>
            </>
        ),
    },
    {
        id: 'fees',
        title: 'Fees',
        eyebrow: 'WHAT IT COSTS',
        body: (
            <>
                <p>
                    <strong>What does {APP_NAME} charge?</strong> A protocol fee on filled orders
                    and a fee on settlement payouts. The current schedule is published on the
                    trading interface.
                </p>
                <p>
                    <strong>What about gas?</strong> Solana network fees are paid in SOL by the
                    wallet that signs the transaction, typically a fraction of a cent per trade.
                </p>
            </>
        ),
    },
    {
        id: 'resolution',
        title: 'Resolution',
        eyebrow: 'OUTCOMES',
        body: (
            <>
                <p>
                    <strong>Who decides the outcome?</strong> Each market specifies a source of
                    truth before any trade is placed — for example, AP for elections, CME settlement
                    prices for finance, official league results for sports. See the{' '}
                    <a href="/docs/resolution">Resolution Sources</a> page for the full list.
                </p>
                <p>
                    <strong>What happens if the source is unclear?</strong> {APP_NAME} applies the
                    documented fallback procedure on each market, which can include invalidation and
                    a pro-rata refund of stake to participants.
                </p>
                <p>
                    <strong>Can a resolution be appealed?</strong> Resolutions are final. The rules
                    and source of truth are visible before you place a trade — entering a position
                    is acceptance of the resolution mechanism.
                </p>
            </>
        ),
    },
    {
        id: 'deposits-and-withdrawals',
        title: 'Deposits and withdrawals',
        eyebrow: 'MONEY IN, MONEY OUT',
        body: (
            <>
                <p>
                    <strong>How do I fund my wallet?</strong> Send USDC and SOL to your Solana
                    wallet from any exchange or another wallet that supports Solana.
                </p>
                <p>
                    <strong>How do I withdraw winnings?</strong> Settled USDC is paid directly to
                    your wallet on claim. From there, transfer it anywhere you want.
                </p>
                <p>
                    <strong>Are deposits insured?</strong> No. {APP_NAME} is non-custodial; funds in
                    open positions are held by smart contracts. They are not FDIC insured and not
                    covered by any government guarantee.
                </p>
            </>
        ),
    },
    {
        id: 'security',
        title: 'Security',
        eyebrow: 'KEEPING SAFE',
        body: (
            <>
                <p>
                    <strong>Who has my keys?</strong> Only you. {APP_NAME} never stores or has
                    access to your private keys, seed phrases, or signing credentials.
                </p>
                <p>
                    <strong>Is the contract audited?</strong> Yes — audit reports are published in
                    the documentation. Read them before depositing meaningful capital.
                </p>
                <p>
                    <strong>What if my wallet is compromised?</strong> {APP_NAME} cannot reverse a
                    signed transaction or restore lost funds. Wallet security is your
                    responsibility.
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
                    <strong>Where can I use {APP_NAME}?</strong> {APP_NAME} is not available in
                    several jurisdictions. See the <a href="/eligibility">Eligibility</a> page for
                    the current list of restricted regions.
                </p>
                <p>
                    <strong>Is there KYC?</strong> Standard browsing and trading do not require KYC.
                    Larger positions or fiat on-ramps via partners may.
                </p>
            </>
        ),
    },
    {
        id: 'taxes',
        title: 'Taxes',
        eyebrow: 'IMPORTANT NOTE',
        body: (
            <>
                <p>
                    <strong>Does {APP_NAME} issue tax forms?</strong> No. {APP_NAME} does not issue
                    1099s or any other tax forms. You are responsible for reporting your trading
                    activity to the relevant tax authority in your jurisdiction.
                </p>
                <p>
                    All trades are recorded on the Solana blockchain and can be exported from the
                    portfolio page. Consult a qualified tax professional for advice specific to your
                    situation.
                </p>
            </>
        ),
    },
    {
        id: 'support',
        title: 'Support',
        eyebrow: 'STILL STUCK?',
        body: (
            <>
                <p>
                    Visit the <a href="/support">Support</a> page or email{' '}
                    <a href="mailto:support@solmarket.xyz">support@solmarket.xyz</a>. For security
                    issues, write to{' '}
                    <a href="mailto:security@solmarket.xyz">security@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
];

export default function FaqPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEARN · FAQ"
            title="Frequently asked questions"
            description={`The questions we see most often, grouped by topic. If you can't find an answer here, reach out via Support.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

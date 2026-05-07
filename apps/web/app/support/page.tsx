import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Support',
    description: `How to get help with ${APP_NAME} — wallet issues, trade problems, security, and more.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'self-serve',
        title: 'Try self-serve first',
        eyebrow: 'FASTEST PATH',
        body: (
            <>
                <p>
                    Most questions are answered in the documentation. Before reaching out, check the{' '}
                    <a href="/faq">FAQ</a>, the <a href="/how-it-works">How it works</a> guide, and
                    the <a href="/docs/resolution">Resolution Sources</a> page. For trade and
                    settlement questions, the on-chain transaction history in your wallet is usually
                    the fastest way to confirm what happened.
                </p>
            </>
        ),
    },
    {
        id: 'support-email',
        title: 'Email support',
        eyebrow: 'GENERAL HELP',
        body: (
            <>
                <p>
                    For account, trade, or product issues, write to{' '}
                    <a href="mailto:support@solmarket.xyz">support@solmarket.xyz</a>. Include the
                    wallet address involved (no private key, ever), the transaction signatures
                    relevant to your issue, the market ID or URL, and a brief description of what
                    you expected vs. what you saw.
                </p>
                <p>
                    Typical first response time is one business day. {APP_NAME} cannot reverse
                    on-chain transactions, recover lost keys, or modify the outcome of a resolved
                    market.
                </p>
            </>
        ),
    },
    {
        id: 'security',
        title: 'Security disclosures',
        eyebrow: 'VULNERABILITIES',
        body: (
            <>
                <p>
                    Found a vulnerability? Send a detailed report to{' '}
                    <a href="mailto:security@solmarket.xyz">security@solmarket.xyz</a>. Do not
                    disclose publicly until {APP_NAME} has confirmed the issue and patched it.
                    Eligible reports may qualify for the bug bounty program documented in the
                    repository.
                </p>
            </>
        ),
    },
    {
        id: 'legal-and-privacy',
        title: 'Legal and privacy requests',
        eyebrow: 'OFFICIAL CHANNELS',
        body: (
            <>
                <p>
                    For legal questions, takedown notices, or regulator inquiries, write to{' '}
                    <a href="mailto:legal@solmarket.xyz">legal@solmarket.xyz</a>. For data access or
                    deletion requests under applicable privacy law, write to{' '}
                    <a href="mailto:privacy@solmarket.xyz">privacy@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
    {
        id: 'community',
        title: 'Community channels',
        eyebrow: 'PEER SUPPORT',
        body: (
            <>
                <p>
                    The {APP_NAME} Discord and Twitter / X account are useful for live discussion
                    and product updates. Community channels are not official support — never share
                    private keys, seed phrases, or signed messages with anyone, including people
                    claiming to represent {APP_NAME}.
                </p>
            </>
        ),
    },
    {
        id: 'what-we-cannot-do',
        title: 'What we cannot do',
        eyebrow: 'LIMITATIONS',
        body: (
            <>
                <p>
                    {APP_NAME} cannot reverse a confirmed Solana transaction, recover a lost or
                    leaked seed phrase, change the resolution of a settled market, refund a losing
                    position, or override the rules published on a market page before trades were
                    placed.
                </p>
            </>
        ),
    },
];

export default function SupportPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="HELP · SUPPORT"
            title="Support"
            description={`How to get help with ${APP_NAME} — start with the docs, then email if you're still stuck.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

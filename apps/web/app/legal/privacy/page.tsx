import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: `How ${APP_NAME} handles personal data, on-chain activity, and analytics.`,
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
                    This Privacy Policy explains what information {APP_NAME} collects when you
                    interact with our websites, smart contracts, and APIs (the
                    &ldquo;Services&rdquo;), how that information is used, and the choices you have.{' '}
                    {APP_NAME} is a Solana-native, non-custodial prediction market — we collect as
                    little personal data as possible to operate the Services and meet our legal
                    obligations.
                </p>
            </>
        ),
    },
    {
        id: 'what-we-collect',
        title: 'What we collect',
        eyebrow: 'DATA TYPES',
        body: (
            <>
                <p>
                    <strong>On-chain activity.</strong> Wallet addresses that interact with the
                    Services and the transactions they sign are public on the Solana blockchain.{' '}
                    {APP_NAME} indexes this data to render portfolios, leaderboards, and order
                    books.
                </p>
                <p>
                    <strong>Device and usage data.</strong> When you visit the website we collect
                    standard request metadata (IP address, user agent, referrer, page path) and
                    anonymous interaction events to operate, debug, and improve the product.
                </p>
                <p>
                    <strong>Voluntary information.</strong> If you contact support or subscribe to
                    updates, we receive whatever you choose to send (email, message contents).
                </p>
            </>
        ),
    },
    {
        id: 'what-we-do-not-collect',
        title: 'What we do not collect',
        eyebrow: 'OFF LIMITS',
        body: (
            <>
                <p>
                    {APP_NAME} does not collect names, government IDs, dates of birth, or any other
                    KYC information for standard browsing and trading. We never have access to
                    private keys, seed phrases, or signing credentials.
                </p>
            </>
        ),
    },
    {
        id: 'how-we-use-data',
        title: 'How we use data',
        eyebrow: 'PURPOSES',
        body: (
            <>
                <p>
                    Collected data is used to operate the Services (render the UI, match orders,
                    settle markets), to detect and prevent abuse and sanctions evasion, to satisfy
                    legal obligations, and to improve product quality through aggregate analytics.
                </p>
                <p>
                    {APP_NAME} does not sell personal data and does not use it for behavioral
                    advertising on third-party platforms.
                </p>
            </>
        ),
    },
    {
        id: 'sharing',
        title: 'Sharing with third parties',
        eyebrow: 'WHO SEES WHAT',
        body: (
            <>
                <p>
                    {APP_NAME} shares limited data with infrastructure providers (hosting, RPC,
                    analytics, error tracking) under contracts that restrict use to operating the
                    Services. We may disclose information when required by law, court order, or
                    legitimate request from a regulator or law-enforcement agency.
                </p>
            </>
        ),
    },
    {
        id: 'cookies',
        title: 'Cookies and similar technologies',
        eyebrow: 'BROWSER STATE',
        body: (
            <>
                <p>
                    The Services use cookies and local storage for session state, preferences, and
                    anonymous analytics. You can disable cookies in your browser; some features may
                    not function correctly.
                </p>
            </>
        ),
    },
    {
        id: 'retention',
        title: 'Retention',
        eyebrow: 'HOW LONG',
        body: (
            <>
                <p>
                    On-chain data persists on the Solana blockchain indefinitely and cannot be
                    deleted by {APP_NAME}. Off-chain logs and analytics are retained for the minimum
                    period needed for the purposes above and then deleted or anonymized.
                </p>
            </>
        ),
    },
    {
        id: 'your-rights',
        title: 'Your rights',
        eyebrow: 'CONTROL',
        body: (
            <>
                <p>
                    Depending on your jurisdiction, you may have the right to access, correct, or
                    delete personal data we hold about you, or to object to certain uses. Contact{' '}
                    <a href="mailto:privacy@solmarket.xyz">privacy@solmarket.xyz</a> to exercise
                    these rights. We will verify your request before acting on it.
                </p>
            </>
        ),
    },
    {
        id: 'children',
        title: 'Children',
        eyebrow: 'AGE',
        body: (
            <>
                <p>
                    The Services are not directed to anyone under 18 and we do not knowingly collect
                    data from minors. If you believe a minor has provided us with personal data,
                    please contact us and we will remove it.
                </p>
            </>
        ),
    },
    {
        id: 'changes',
        title: 'Changes to this policy',
        eyebrow: 'UPDATES',
        body: (
            <>
                <p>
                    {APP_NAME} may update this Privacy Policy from time to time. Material changes
                    will be indicated by updating the &ldquo;Effective&rdquo; date and, where
                    appropriate, by additional notice on the Services.
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
                    Privacy questions or requests can be sent to{' '}
                    <a href="mailto:privacy@solmarket.xyz">privacy@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
];

export default function PrivacyPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEGAL · PRIVACY POLICY"
            title="Privacy Policy"
            description={`What ${APP_NAME} collects, how it's used, and the rights you have over your data.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

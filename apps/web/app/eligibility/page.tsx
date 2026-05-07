import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Eligibility',
    description: `Who can use ${APP_NAME} — age requirements, restricted jurisdictions, sanctions, and verification.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'who-can-use',
        title: 'Who can use the Services',
        eyebrow: 'OVERVIEW',
        body: (
            <>
                <p>
                    To use {APP_NAME} you must be at least 18 years old (or the age of majority in
                    your jurisdiction, whichever is greater), have full legal capacity to enter
                    binding agreements, and not be a person barred from trading on prediction
                    markets under applicable law.
                </p>
            </>
        ),
    },
    {
        id: 'restricted-jurisdictions',
        title: 'Restricted jurisdictions',
        eyebrow: 'GEOGRAPHY',
        body: (
            <>
                <p>
                    The Services are not offered to, and may not be used by, persons located in or
                    residents of:
                </p>
                <p>
                    The United States of America, the United Kingdom, Canada, France, Singapore,
                    Hong Kong, mainland China, North Korea, Iran, Syria, Cuba, Russia, Belarus, the
                    Crimea, Donetsk, and Luhansk regions, or any other jurisdiction where the use of
                    prediction markets or the trading of related financial instruments is prohibited
                    by applicable law.
                </p>
                <p>
                    The list above is not exhaustive. {APP_NAME} may update it at any time and may
                    deny access to wallets that, in its reasonable judgment, originate from a
                    restricted jurisdiction.
                </p>
            </>
        ),
    },
    {
        id: 'sanctions',
        title: 'Sanctions',
        eyebrow: 'COMPLIANCE',
        body: (
            <>
                <p>
                    You must not be subject to, listed on, or otherwise the target of sanctions
                    administered by the U.S. Office of Foreign Assets Control (OFAC), the European
                    Union, the United Kingdom, the United Nations, or any other relevant sanctions
                    authority. {APP_NAME} screens wallet addresses against sanctions lists and may
                    block addresses appearing on those lists.
                </p>
            </>
        ),
    },
    {
        id: 'verification',
        title: 'Verification',
        eyebrow: 'KYC',
        body: (
            <>
                <p>
                    Standard browsing and trading on {APP_NAME} do not require identity
                    verification. {APP_NAME} may require verification (KYC) for certain features —
                    including fiat on-ramps offered through partners, large positions, or
                    institutional access — and may deny or restrict access to users who decline.
                </p>
            </>
        ),
    },
    {
        id: 'access-controls',
        title: 'Access controls',
        eyebrow: 'TECHNICAL MEASURES',
        body: (
            <>
                <p>
                    {APP_NAME} uses geolocation, IP-address screening, wallet screening, and other
                    controls to enforce these eligibility rules. Attempting to circumvent these
                    controls — including via VPN, proxy, or false declarations — is a breach of the{' '}
                    <a href="/legal/terms">Terms of Service</a> and may result in forfeiture of
                    positions and permanent loss of access.
                </p>
            </>
        ),
    },
    {
        id: 'changes',
        title: 'Changes',
        eyebrow: 'UPDATES',
        body: (
            <>
                <p>
                    Eligibility rules can change in response to law, guidance, or business policy.
                    Material changes will be indicated by updating the &ldquo;Effective&rdquo; date
                    at the top of this page.
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
                    Eligibility questions can be sent to{' '}
                    <a href="mailto:legal@solmarket.xyz">legal@solmarket.xyz</a>.
                </p>
            </>
        ),
    },
];

export default function EligibilityPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="LEGAL · ELIGIBILITY"
            title="Eligibility"
            description={`Where ${APP_NAME} is available, who can trade, and how access is enforced.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

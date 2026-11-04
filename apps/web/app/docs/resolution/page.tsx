import { JSX } from 'react';
import type { Metadata } from 'next';

import LegalShell, { LegalSectionInput } from '@/components/legal/LegalShell';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'Resolution Sources',
    description: `The official sources of truth used to resolve markets on ${APP_NAME}, by category.`,
};

const EFFECTIVE_DATE = 'MAY 05, 2026';
const VERSION = 'v1.0';

const sections: LegalSectionInput[] = [
    {
        id: 'official-settlement',
        title: 'Official settlement',
        eyebrow: 'RESOLUTION',
        body: (
            <>
                <p>
                    Markets follow their published Polymarket rules. Settlement requires a final,
                    unambiguous binary payout verified on the Polygon Conditional Tokens contract.
                </p>
                <p>
                    Every market, including short-window crypto markets, waits the configured
                    dispute period after we first verify finality. The default waiting period is 48
                    hours. Event end times and displayed prices do not establish a winner.
                </p>
                <p>
                    Disputed, split, unsupported, or unavailable results stay pending until final
                    evidence can be verified. There is no price-feed fallback or manual winner
                    selection. Winning shares become claimable after settlement on Solana.
                </p>
            </>
        ),
    },
];

export default function ResolutionSourcesPage(): JSX.Element {
    return (
        <LegalShell
            eyebrow="DOCS · RESOLUTION SOURCES"
            title="Resolution Sources"
            description={`Where ${APP_NAME} markets get their answers — official settlement evidence and the waiting period.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

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
        id: 'how-resolution-works',
        title: 'How resolution works',
        eyebrow: 'OVERVIEW',
        body: (
            <>
                <p>
                    Every market on {APP_NAME} specifies a single source of truth before any trade
                    is placed. When the source confirms the outcome, the market resolves on-chain
                    and winning shares become claimable for $1.00 each in USDC.
                </p>
                <p>
                    The category-by-category list below shows the primary source used for each
                    market type, the fallback used if the primary source is unavailable, and the
                    typical timing from event to resolution. Individual markets may override these
                    defaults; the rule set on the market page is always authoritative.
                </p>
            </>
        ),
    },
    {
        id: 'politics',
        title: 'Politics',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Associated Press race calls for U.S. and major
                    international elections; official government gazettes for legislative outcomes;
                    Federal Reserve press releases and FOMC statements for monetary policy markets.
                </p>
                <p>
                    <strong>Fallback:</strong> Reuters and the Cook Political Report for elections;
                    the official Federal Register for U.S. legislative acts.
                </p>
                <p>
                    <strong>Typical timing:</strong> Within 24 hours of the event being publicly
                    confirmed.
                </p>
            </>
        ),
    },
    {
        id: 'crypto',
        title: 'Crypto',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Coinbase spot prices for major USD pairs (BTC-USD,
                    ETH-USD, SOL-USD); on-chain state for protocol-specific outcomes (e.g., a
                    governance proposal passing).
                </p>
                <p>
                    <strong>Fallback:</strong> CoinGecko time-weighted average price (TWAP) across
                    the top three liquid venues for the asset.
                </p>
                <p>
                    <strong>Typical timing:</strong> Immediately on price-trigger markets;
                    block-confirmation latency for on-chain outcomes.
                </p>
            </>
        ),
    },
    {
        id: 'sports',
        title: 'Sports',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Official league results — NBA, NFL, MLB, NHL, FIFA,
                    UEFA, ATP, WTA, F1, and other recognized governing bodies.
                </p>
                <p>
                    <strong>Fallback:</strong> ESPN, BBC Sport, or the league&apos;s primary
                    broadcast partner where the official record is delayed.
                </p>
                <p>
                    <strong>Typical timing:</strong> Within hours of the final whistle, subject to
                    any post-match review or protest by the league.
                </p>
            </>
        ),
    },
    {
        id: 'finance-and-economy',
        title: 'Finance and economy',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> CME Group settlement prices for futures (WTI, gold,
                    indices); Bureau of Labor Statistics releases for CPI, NFP, and other macro
                    prints; central bank press releases for rate decisions.
                </p>
                <p>
                    <strong>Fallback:</strong> Bloomberg or Refinitiv consensus where the primary
                    source is delayed beyond two business days.
                </p>
                <p>
                    <strong>Typical timing:</strong> Same business day for futures settlements;
                    within minutes of release for macro prints.
                </p>
            </>
        ),
    },
    {
        id: 'geopolitics',
        title: 'Geopolitics',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Reuters and the Associated Press wire reports of
                    signed agreements, declarations, and recognized statements from heads of state
                    or accredited representatives.
                </p>
                <p>
                    <strong>Fallback:</strong> The United Nations or relevant international body
                    (e.g., NATO, EU Council, OPEC) official statement.
                </p>
                <p>
                    <strong>Typical timing:</strong> Within 48 hours of public confirmation by at
                    least two independent wire services.
                </p>
            </>
        ),
    },
    {
        id: 'tech',
        title: 'Tech',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Official company press releases, blog posts, or SEC
                    filings for product launches, leadership changes, and acquisitions.
                </p>
                <p>
                    <strong>Fallback:</strong> Reuters, Bloomberg, or The Verge for events without a
                    clean primary record.
                </p>
                <p>
                    <strong>Typical timing:</strong> Same day where a press release exists; up to
                    one week for events that require regulatory filings to confirm.
                </p>
            </>
        ),
    },
    {
        id: 'culture',
        title: 'Culture',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> Official artist or studio social media accounts and
                    record-label press releases for album, film, and award outcomes; Billboard or
                    IFPI charts where ranking is the resolution criterion.
                </p>
                <p>
                    <strong>Fallback:</strong> Variety or The Hollywood Reporter for entertainment
                    outcomes.
                </p>
                <p>
                    <strong>Typical timing:</strong> Within 48 hours of the event.
                </p>
            </>
        ),
    },
    {
        id: 'science-and-weather',
        title: 'Science and weather',
        eyebrow: 'CATEGORY',
        body: (
            <>
                <p>
                    <strong>Primary:</strong> NASA, NOAA, the European Space Agency, the IPCC, and
                    the relevant national meteorological service for weather and climate markets.
                </p>
                <p>
                    <strong>Fallback:</strong> Peer-reviewed publications or the originating
                    research institution&apos;s press release.
                </p>
                <p>
                    <strong>Typical timing:</strong> Annual or seasonal cadence — see the specific
                    market for the resolution date.
                </p>
            </>
        ),
    },
    {
        id: 'fallback-procedure',
        title: 'Fallback procedure',
        eyebrow: 'WHEN SOURCES FAIL',
        body: (
            <>
                <p>
                    If both the primary and fallback sources are unavailable, ambiguous, or
                    compromised, {APP_NAME} applies the procedure documented on the market page.
                    Available actions include extending the resolution window, switching to a
                    pre-declared backup source, or invalidating the market and refunding stake on a
                    pro-rata basis. {APP_NAME} does not retroactively change the source of truth
                    listed on a live market.
                </p>
            </>
        ),
    },
    {
        id: 'questions',
        title: 'Questions',
        eyebrow: 'CONTACT',
        body: (
            <>
                <p>
                    Questions about a specific market&apos;s sourcing or resolution can be sent to{' '}
                    <a href="mailto:resolution@solmarket.xyz">resolution@solmarket.xyz</a>.
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
            description={`Where ${APP_NAME} markets get their answers — the primary source, the fallback, and the typical timing for every category.`}
            effective_date={EFFECTIVE_DATE}
            version={VERSION}
            sections={sections}
        />
    );
}

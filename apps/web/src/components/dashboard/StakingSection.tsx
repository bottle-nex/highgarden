'use client';
import { JSX } from 'react';
import type { YesNoMarket, MultiCandidateMarket, MultiOptionMarket } from '@/utils/constants';
import YesNoStakeCard from './YesNoStakeCard';
import MultiCandidateStakeCard from './MultiCandidateStakeCard';
import MultiOptionStakeCard from './MultiOptionStakeCard';
import SectionHeading from './SectionHeading';

interface Props {
    yesNoMarkets: YesNoMarket[];
    multiCandidateMarkets: MultiCandidateMarket[];
    multiOptionMarkets: MultiOptionMarket[];
}

export default function StakingSection({
    yesNoMarkets,
    multiCandidateMarkets,
    multiOptionMarkets,
}: Props): JSX.Element {
    return (
        <section>
            <SectionHeading title="STAKE ON OUTCOMES" subtitle="PREDICTION MARKETS" />

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {yesNoMarkets.map((m) => (
                    <YesNoStakeCard key={m.id} market={m} />
                ))}
                {multiCandidateMarkets.map((m) => (
                    <MultiCandidateStakeCard key={m.id} market={m} />
                ))}
                {multiOptionMarkets.map((m) => (
                    <MultiOptionStakeCard key={m.id} market={m} />
                ))}
            </div>
        </section>
    );
}

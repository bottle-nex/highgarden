'use client';
import { JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import type { YesNoMarket, MultiCandidateMarket, MultiOptionMarket } from '@/utils/constants';
import YesNoStakeCard from './YesNoStakeCard';
import MultiCandidateStakeCard from './MultiCandidateStakeCard';
import MultiOptionStakeCard from './MultiOptionStakeCard';
import SectionHeading from './SectionHeading';

type FilterKey = 'ALL' | 'YES / NO' | 'MULTI-CANDIDATE' | 'MULTI-OPTION';

const FILTERS: FilterKey[] = ['ALL', 'YES / NO', 'MULTI-CANDIDATE', 'MULTI-OPTION'];

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
    const [filter, setFilter] = useState<FilterKey>('ALL');

    const showYesNo = filter === 'ALL' || filter === 'YES / NO';
    const showCandidates = filter === 'ALL' || filter === 'MULTI-CANDIDATE';
    const showOptions = filter === 'ALL' || filter === 'MULTI-OPTION';

    return (
        <section>
            <SectionHeading title="STAKE ON OUTCOMES" subtitle="PREDICTION MARKETS" />

            <div className="mb-5 flex items-center gap-1 border border-white/8 bg-neutral-950 p-1 rounded-sm w-fit">
                {FILTERS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={cn(
                            'px-3 py-1.5 rounded-xs font-mono text-[9px] tracking-[0.22em] uppercase transition-colors cursor-pointer',
                            filter === key
                                ? 'bg-white/10 text-white/80'
                                : 'text-white/40 hover:text-white/65',
                        )}
                    >
                        {key}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {showYesNo && yesNoMarkets.map((m) => <YesNoStakeCard key={m.id} market={m} />)}
                {showCandidates &&
                    multiCandidateMarkets.map((m) => (
                        <MultiCandidateStakeCard key={m.id} market={m} />
                    ))}
                {showOptions &&
                    multiOptionMarkets.map((m) => <MultiOptionStakeCard key={m.id} market={m} />)}
            </div>
        </section>
    );
}

'use client';
import { JSX } from 'react';
import { LuChevronsUpDown } from 'react-icons/lu';
import {
    selectAllPositions,
    selectPositionsLoading,
    usePositionsStore,
} from '@/store/portfolio/usePositionsStore';
import PositionRow from './PositionRow';
import EmptyTabState from './EmptyTabState';

const COLUMN_HEADERS = ['Market', 'Avg → Now', 'Traded', 'To win', 'Value'];

export default function PositionsTable(): JSX.Element {
    const positions = usePositionsStore(selectAllPositions);
    const loading = usePositionsStore(selectPositionsLoading);

    if (loading && positions.length === 0) {
        return (
            <div className="mt-8 py-16 text-center text-white/40 text-sm border border-neutral-900 bg-dark-alpha">
                Loading positions…
            </div>
        );
    }

    if (positions.length === 0) {
        return <EmptyTabState label="Positions" />;
    }

    return (
        <div className="mt-4">
            <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-2 pb-3 text-xs text-white/50 uppercase tracking-wide">
                {COLUMN_HEADERS.map((header) => (
                    <div key={header} className="flex items-center gap-x-1">
                        {header} <LuChevronsUpDown className="size-3" />
                    </div>
                ))}
                <div />
            </div>
            {positions.map((position) => (
                <PositionRow
                    key={`${position.marketId}-${position.outcome}`}
                    position={position}
                />
            ))}
        </div>
    );
}

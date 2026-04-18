import { JSX } from 'react';
import { LuChevronsUpDown } from 'react-icons/lu';
import PositionRow from './PositionRow';
import type { Position } from './types';

const PORTFOLIO_POSITIONS: Position[] = [
    {
        id: '1',
        title: 'Bitcoin Up or Down - April 15, 1:45PM-1:5...',
        side: 'Up',
        sideCents: 81,
        shares: 1.2,
        avg: 81,
        now: 100,
        traded: 0.99,
        toWin: 1.22,
        status: 'WON',
        value: 1.22,
    },
    {
        id: '2',
        title: 'Bitcoin Up or Down - April 17, 2:10PM-2:1...',
        side: 'Down',
        sideCents: 86,
        shares: 1.2,
        avg: 86,
        now: 100,
        traded: 0.99,
        toWin: 1.15,
        status: 'WON',
        value: 1.15,
    },
];

const COLUMN_HEADERS = ['Market', 'Avg → Now', 'Traded', 'To win', 'Value'];

export default function PositionsTable(): JSX.Element {
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
            {PORTFOLIO_POSITIONS.map((position) => (
                <PositionRow key={position.id} position={position} />
            ))}
        </div>
    );
}

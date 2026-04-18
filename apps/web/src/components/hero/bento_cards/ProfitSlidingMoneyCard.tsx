import { JSX } from 'react';
import StakingCard from '../StakingCard';
import CardHeader from './CardHeader';

export default function SlidingMoneyCard(): JSX.Element {
    return (
        <div className="group relative flex h-150 flex-col overflow-hidden bg-neutral-950 p-10">
            <CardHeader label="Markets & Effects" context="Solana Context" />

            <div className="mt-5">
                <h3 className="text-[1.75rem] font-semibold leading-tight text-white">
                    Hundreds of Prediction Markets,
                    <br />
                    Limitless Effects
                </h3>
                <p className="mt-3 text-sm text-neutral-400">
                    Analyze events, manage portfolios with rich data, and apply powerful effects.
                </p>
            </div>

            <div className="relative flex-1 -mt-10">
                <StakingCard />
            </div>
        </div>
    );
}

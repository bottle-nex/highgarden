import { JSX } from 'react';
import SlidingMoneyCard from './bento_cards/ProfitSlidingMoneyCard';
import LiquidityCard from './bento_cards/LiquidityCard';
import PredictionEntrySection from './bento_cards/PredictionEntrySection';
import StackedCards from './bento_cards/StackedCards';

export default function LandingBentoSection(): JSX.Element {
    return (
        <section className="min-h-screen w-full bg-black flex flex-col items-center pt-40 px-6">
            <h2 className="max-w-2xl text-center text-[2.7rem] leading-none font-medium">
                Unlock a Whole New Era of Prediction Markets
            </h2>

            <div className="mt-12 w-full max-w-340 bg-dark-alpha p-2 flex flex-col gap-2">
                <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-2">
                    <SlidingMoneyCard />
                    <PredictionEntrySection />
                </div>
                <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-2">
                    <LiquidityCard />
                    <StackedCards />
                </div>
            </div>
        </section>
    );
}

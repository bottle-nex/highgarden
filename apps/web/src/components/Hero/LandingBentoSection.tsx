import { JSX } from 'react';
import SlidingMoneyCard from './bento_cards/ProfitSlidingMoneyCard';
import LiquidityCard from './bento_cards/LiquidityCard';

export default function LandingBentoSection(): JSX.Element {
    return (
        <section className="min-h-screen w-full bg-black flex flex-col items-center pt-40 px-6">
            <h2 className="max-w-3xl text-center text-[2.7rem] leading-none font-medium">
                Unlock a Whole New Era of Prediction Markets
            </h2>

            <div className="mt-12 w-full max-w-340 bg-dark-alpha p-2">
                <div className="grid w-full grid-cols-1 md:grid-cols-2 gap-2">
                    <SlidingMoneyCard />
                    <LiquidityCard />
                </div>
            </div>
        </section>
    );
}

'use client';

import { JSX } from 'react';
import { motion } from 'motion/react';

import AboutHero from './AboutHero';
import AboutTeam from './AboutTeam';
import { Engineer } from './EngineerCard';
import AppFaq from '../faq/AppFaq';
import { APP_NAME } from '@/utils/constants';

type Props = {
    engineers: Engineer[];
};

export default function AboutShell({ engineers }: Props): JSX.Element {
    return (
        <main className="relative w-full bg-neutral-950 pt-32 pb-32">
            <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
                <AboutHero
                    eyebrow={`ABOUT · WHO BUILDS ${APP_NAME.toUpperCase()}`}
                    title={`The ${APP_NAME} story.`}
                    description={`${APP_NAME} is a Solana-native prediction market — built by a small team that wanted event trading to feel as fast and direct as the chain underneath it.`}
                    meta_left={{ label: 'BUILT ON', value: 'SOLANA' }}
                    meta_right={{ label: 'STAGE', value: 'MAINNET' }}
                />

                <div className="mt-16 space-y-16">
                    <AboutMission index={1} />
                    <AboutTeam index={2} engineers={engineers} />
                    <AppFaq index={3} />
                </div>
            </div>
        </main>
    );
}

function AboutMission({ index }: { index: number }): JSX.Element {
    const number = String(index).padStart(2, '0');

    return (
        <motion.section
            id="mission"
            className="scroll-mt-28"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
            <div className="mb-6 flex items-center gap-x-3">
                <span className="text-[10px] tabular-nums tracking-[0.25em] text-alpha/80">
                    {number}
                </span>
                <span className="h-px w-6 bg-white/20" />
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                    MISSION
                </span>
            </div>

            <h2 className="mb-6 max-w-3xl text-2xl font-medium tracking-tight text-white md:text-3xl">
                Make future outcomes transparent, tradable, and verifiable on Solana.
            </h2>

            <div className="grid max-w-3xl gap-y-5 text-[14px] leading-[1.75] text-white/65">
                <p>
                    Prediction markets work when the price is honest, the settlement is
                    automatic, and the cost of being wrong is exactly the cost of being wrong —
                    no spreads hidden in the UI, no custodian holding the payout. That gets
                    harder, not easier, when liquidity is thin and the rails are slow.
                </p>
                <p>
                    {APP_NAME} is the version we wanted to use. Day-one liquidity mirrored from
                    the deepest existing books, settlement in Solana USDC, fees and latency the
                    chain was designed for, and rules that are public before any trade is placed.
                    Everything you see is one Solana program away from final.
                </p>
            </div>
        </motion.section>
    );
}

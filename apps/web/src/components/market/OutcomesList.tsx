'use client';
import { JSX } from 'react';
import { motion } from 'motion/react';
import type { MarketOutcome } from '@/utils/constants';
import s from './OutcomesList.module.css';
import ms from './market.module.css';

interface Props {
    outcomes: MarketOutcome[];
    type: string;
}

export default function OutcomesList({ outcomes, type }: Props): JSX.Element {
    return (
        <div className={ms.card}>
            <div className={ms.cardHeader}>
                <div className={ms.sectionLabel} style={{ margin: 0 }}>
                    <span className={ms.sectionDot} />
                    {type === 'yes-no' ? 'OUTCOME PRICES' : 'ALL OUTCOMES'}
                </div>
                <span>{outcomes.length} OPTIONS</span>
            </div>
            <div className={s.wrapper}>
                <div className={s.list}>
                    {outcomes.map((outcome, i) => {
                        const isUp = outcome.change >= 0;
                        return (
                            <motion.div
                                key={outcome.id}
                                className={s.row}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{
                                    duration: 0.35,
                                    delay: i * 0.06,
                                    ease: [0.25, 0.46, 0.45, 0.94],
                                }}
                            >
                                <div className={s.labelCol}>
                                    <span className={s.label}>{outcome.label}</span>
                                    <div className={s.barTrack}>
                                        <motion.div
                                            className={s.barFill}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${outcome.probability}%` }}
                                            transition={{
                                                duration: 0.7,
                                                delay: i * 0.06 + 0.2,
                                                ease: [0.25, 0.46, 0.45, 0.94],
                                            }}
                                        />
                                    </div>
                                </div>
                                <span className={s.prob}>{outcome.probability}%</span>
                                <span className={s.volume}>{outcome.volume}</span>
                                <span className={`${s.change} ${isUp ? s.changeUp : s.changeDown}`}>
                                    {isUp ? '+' : ''}
                                    {outcome.change.toFixed(1)}%
                                </span>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

'use client';
import { JSX } from 'react';
import { motion } from 'motion/react';
import type { MarketRule } from '@/utils/constants';
import s from './MarketRules.module.css';
import ms from './market.module.css';

interface Props {
    rules: MarketRule;
}

export default function MarketRules({ rules }: Props): JSX.Element {
    return (
        <div className={ms.card}>
            <div className={ms.cardHeader}>
                <div className={ms.sectionLabel} style={{ margin: 0 }}>
                    <span className={ms.sectionDot} />
                    RULES &amp; RESOLUTION
                </div>
            </div>
            <motion.div
                className={s.wrapper}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
            >
                <div className={s.rules}>
                    <div className={s.rule}>
                        <div className={`${s.ruleLabel} ${s.ruleLabelYes}`}>
                            <span className={`${s.ruleIcon} ${s.ruleIconYes}`} />
                            RESOLVES YES
                        </div>
                        <p className={s.ruleText}>{rules.yesCondition}</p>
                    </div>

                    <div className={s.rule}>
                        <div className={`${s.ruleLabel} ${s.ruleLabelNo}`}>
                            <span className={`${s.ruleIcon} ${s.ruleIconNo}`} />
                            RESOLVES NO
                        </div>
                        <p className={s.ruleText}>{rules.noCondition}</p>
                    </div>

                    <div className={s.rule}>
                        <div className={`${s.ruleLabel} ${s.ruleLabelSource}`}>
                            <span className={`${s.ruleIcon} ${s.ruleIconSource}`} />
                            SOURCE OF TRUTH
                        </div>
                        <p className={s.ruleText}>{rules.sourceOfTruth}</p>
                    </div>

                    {rules.additionalNotes && (
                        <div className={s.rule}>
                            <div className={`${s.ruleLabel} ${s.ruleLabelNote}`}>
                                <span className={`${s.ruleIcon} ${s.ruleIconNote}`} />
                                NOTE
                            </div>
                            <p className={s.ruleText}>{rules.additionalNotes}</p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

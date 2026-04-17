'use client';
import { JSX } from 'react';
import { motion } from 'motion/react';
import type { MarketTrade } from '@/utils/constants';
import s from './MarketActivity.module.css';
import ms from './market.module.css';

interface Props {
    trades: MarketTrade[];
}

export default function MarketActivity({ trades }: Props): JSX.Element {
    return (
        <div className={ms.card}>
            <div className={ms.cardHeader}>
                <div className={ms.sectionLabel} style={{ margin: 0 }}>
                    <span className={ms.sectionDot} />
                    RECENT ACTIVITY
                </div>
                <span>LIVE FEED</span>
            </div>
            <div className={s.wrapper}>
                <div className={s.list}>
                    {trades.map((trade, i) => {
                        const isBuy = trade.side === 'BUY';
                        return (
                            <motion.div
                                key={trade.id}
                                className={s.trade}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.3,
                                    delay: i * 0.05,
                                    ease: [0.25, 0.46, 0.45, 0.94],
                                }}
                            >
                                <span className={`${s.sideTag} ${isBuy ? s.sideBuy : s.sideSell}`}>
                                    {trade.side}
                                </span>
                                <span className={s.outcome}>{trade.outcome}</span>
                                <span className={s.price}>{trade.price}¢</span>
                                <span className={s.amount}>{trade.amount}</span>
                                <span className={s.time}>{trade.time}</span>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

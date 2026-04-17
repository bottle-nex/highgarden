'use client';
import { JSX } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import type { MarketDetail } from '@/utils/constants';
import s from './RelatedMarkets.module.css';
import ms from './market.module.css';

interface Props {
    markets: MarketDetail[];
}

export default function RelatedMarkets({ markets }: Props): JSX.Element {
    if (markets.length === 0) return <></>;

    return (
        <div className={ms.card}>
            <div className={ms.cardHeader}>
                <div className={ms.sectionLabel} style={{ margin: 0 }}>
                    <span className={ms.sectionDot} />
                    RELATED MARKETS
                </div>
                <span>{markets.length} MARKETS</span>
            </div>
            <div className={s.wrapper}>
                <div className={s.grid}>
                    {markets.map((m, i) => {
                        const isUp = m.change24h >= 0;
                        return (
                            <motion.div
                                key={m.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.35,
                                    delay: i * 0.08,
                                    ease: [0.25, 0.46, 0.45, 0.94],
                                }}
                            >
                                <Link href={`/market/${m.slug}`} className={s.card}>
                                    <div className={s.cardTop}>
                                        <span className={s.cardCategory}>{m.category}</span>
                                        {m.status === 'live' && (
                                            <span className={s.cardStatus}>
                                                <span className={s.cardStatusDot} />
                                                LIVE
                                            </span>
                                        )}
                                    </div>
                                    <div className={s.cardTitle}>{m.title}</div>
                                    <div className={s.cardFooter}>
                                        <span>VOL {m.volume}</span>
                                        <span
                                            className={`${s.cardChange} ${isUp ? s.cardChangeUp : s.cardChangeDown}`}
                                        >
                                            {isUp ? '+' : ''}
                                            {m.change24h.toFixed(1)}%
                                        </span>
                                    </div>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

'use client';
import { JSX } from 'react';
import { motion } from 'motion/react';
import type { MarketDetail } from '@/utils/constants';
import s from './MarketHeader.module.css';
import ms from './market.module.css';

const TYPE_LABELS: Record<string, string> = {
    'yes-no': 'YES / NO',
    'multi-candidate': 'MULTI-CANDIDATE',
    'multi-option': 'MULTI-OPTION',
};

export default function MarketHeader({ market }: { market: MarketDetail }): JSX.Element {
    const isUp = market.change24h >= 0;

    return (
        <div className={ms.card}>
            <motion.div
                className={s.header}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                <div className={s.topRow}>
                    <span className={s.categoryTag}>{market.category}</span>
                    <span
                        className={`${s.statusBadge} ${
                            market.status === 'live'
                                ? s.statusLive
                                : market.status === 'closed'
                                  ? s.statusClosed
                                  : s.statusPending
                        }`}
                    >
                        {market.status === 'live' && <span className={s.liveDot} />}
                        {market.status.toUpperCase()}
                    </span>
                    <span className={s.typeBadge}>{TYPE_LABELS[market.type]}</span>
                </div>

                <h1 className={s.title}>{market.title}</h1>
                <p className={s.description}>{market.description}</p>

                <div className={s.metaGrid}>
                    <MetaItem label="VOLUME" value={market.volume} />
                    <MetaItem label="LIQUIDITY" value={market.liquidity} />
                    <MetaItem label="TRADERS" value={market.traders.toLocaleString()} />
                    <MetaItem
                        label="24H CHANGE"
                        value={`${isUp ? '+' : ''}${market.change24h.toFixed(1)}%`}
                        variant={isUp ? 'up' : 'down'}
                    />
                    <MetaItem label="END DATE" value={market.endDate} />
                    <MetaItem label="RESOLUTION" value={market.resolutionDate} />
                </div>
            </motion.div>
        </div>
    );
}

function MetaItem({
    label,
    value,
    variant,
}: {
    label: string;
    value: string;
    variant?: 'up' | 'down';
}): JSX.Element {
    return (
        <div className={s.metaItem}>
            <span className={s.metaLabel}>{label}</span>
            <span
                className={`${s.metaValue} ${
                    variant === 'up' ? s.metaValueUp : variant === 'down' ? s.metaValueDown : ''
                }`}
            >
                {value}
            </span>
        </div>
    );
}

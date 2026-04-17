'use client';
import { JSX, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import type { MarketDetail } from '@/utils/constants';
import s from './TradingPanel.module.css';

export default function TradingPanel({ market }: { market: MarketDetail }): JSX.Element {
    const isYesNo = market.type === 'yes-no';
    const [selectedSide, setSelectedSide] = useState<string>(
        isYesNo ? 'YES' : (market.outcomes[0]?.label ?? ''),
    );
    const [amount, setAmount] = useState('');

    const selectedOutcome = useMemo(
        () => market.outcomes.find((o) => o.label === selectedSide),
        [market.outcomes, selectedSide],
    );

    const price = selectedOutcome?.probability ?? 50;
    const numAmount = parseFloat(amount) || 0;
    const payout = numAmount > 0 ? ((numAmount / price) * 100).toFixed(2) : '0.00';
    const fee = (numAmount * 0.02).toFixed(2);

    return (
        <motion.div
            className={s.panel}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
            <div className={s.panelHeader}>
                <span className={s.panelDot} />
                TRADE
            </div>

            <div className={s.panelBody}>
                {isYesNo ? (
                    <div className={s.sideSelector}>
                        <button
                            type="button"
                            className={`${s.sideBtn} ${s.sideBtnYes} ${selectedSide === 'YES' ? s.sideBtnYesActive : ''}`}
                            onClick={() => setSelectedSide('YES')}
                        >
                            <span className={`${s.sideBtnLabel} ${s.sideBtnLabelYes}`}>YES</span>
                            <span className={`${s.sideBtnPrice} ${s.sideBtnPriceYes}`}>
                                {market.outcomes.find((o) => o.label === 'YES')?.probability ?? 0}¢
                            </span>
                        </button>
                        <button
                            type="button"
                            className={`${s.sideBtn} ${s.sideBtnNo} ${selectedSide === 'NO' ? s.sideBtnNoActive : ''}`}
                            onClick={() => setSelectedSide('NO')}
                        >
                            <span className={`${s.sideBtnLabel} ${s.sideBtnLabelNo}`}>NO</span>
                            <span className={`${s.sideBtnPrice} ${s.sideBtnPriceNo}`}>
                                {market.outcomes.find((o) => o.label === 'NO')?.probability ?? 0}¢
                            </span>
                        </button>
                    </div>
                ) : (
                    <div className={s.outcomeSelector}>
                        {market.outcomes.map((outcome) => (
                            <button
                                key={outcome.id}
                                type="button"
                                className={`${s.outcomeBtn} ${selectedSide === outcome.label ? s.outcomeBtnActive : ''}`}
                                onClick={() => setSelectedSide(outcome.label)}
                            >
                                <span className={s.outcomeBtnLabel}>{outcome.label}</span>
                                <span className={s.outcomeBtnPrice}>{outcome.probability}¢</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className={s.inputSection}>
                    <div className={s.inputLabel}>AMOUNT</div>
                    <div className={s.inputWrapper}>
                        <input
                            type="number"
                            className={s.input}
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            min="0"
                            step="0.01"
                        />
                        <span className={s.inputCurrency}>USD</span>
                    </div>
                </div>

                <div className={s.quickBtns}>
                    {[1, 5, 10, 25].map((v) => (
                        <button
                            key={v}
                            type="button"
                            className={s.quickBtn}
                            onClick={() => setAmount(String(v))}
                        >
                            +{v}
                        </button>
                    ))}
                    <button type="button" className={s.quickBtn} onClick={() => setAmount('100')}>
                        MAX
                    </button>
                </div>

                <div className={s.divider} />

                <div className={s.infoRow}>
                    <span className={s.infoLabel}>Avg price</span>
                    <span className={s.infoValue}>{price}¢</span>
                </div>
                <div className={s.infoRow}>
                    <span className={s.infoLabel}>Est. payout</span>
                    <span className={`${s.infoValue} ${s.infoValueGreen}`}>${payout}</span>
                </div>
                <div className={s.infoRow}>
                    <span className={s.infoLabel}>Fee (2%)</span>
                    <span className={s.infoValue}>${fee}</span>
                </div>

                <div className={s.divider} />

                <button
                    type="button"
                    className={`${s.tradeBtn} ${
                        isYesNo
                            ? selectedSide === 'YES'
                                ? s.tradeBtnYes
                                : s.tradeBtnNo
                            : s.tradeBtnNeutral
                    }`}
                >
                    {isYesNo
                        ? `BUY ${selectedSide} · ${price}¢`
                        : `BUY "${selectedSide}" · ${price}¢`}
                </button>
            </div>
        </motion.div>
    );
}

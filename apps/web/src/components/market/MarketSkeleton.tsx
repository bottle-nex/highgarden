'use client';
import { JSX } from 'react';
import s from './market.module.css';

export default function MarketSkeleton(): JSX.Element {
    return (
        <div className={s.page}>
            <div className={s.container}>
                <div className={s.skeletonPage}>
                    <div className={`${s.skeleton} ${s.skeletonHeader}`} />
                    <div className={s.skeletonRow}>
                        <div className={s.skeletonMain}>
                            <div className={`${s.skeleton} ${s.skeletonChart}`} />
                            <div className={`${s.skeleton} ${s.skeletonOutcomes}`} />
                            <div className={`${s.skeleton} ${s.skeletonRules}`} />
                            <div className={`${s.skeleton} ${s.skeletonActivity}`} />
                        </div>
                        <div className={`${s.skeleton} ${s.skeletonSidebar}`} />
                    </div>
                </div>
            </div>
        </div>
    );
}

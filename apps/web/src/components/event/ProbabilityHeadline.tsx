'use client';

import { JSX, useEffect, useRef } from 'react';
import { Outcome } from '@solmarket/types';
import {
    selectDepth,
    useOrderBookDepthStore,
} from '@/store/book/useOrderBookDepthStore';

interface Props {
    marketId: string;
    delta24hPct: number | null;
}

export default function ProbabilityHeadline({ marketId, delta24hPct }: Props): JSX.Element {
    const yes_depth = useOrderBookDepthStore(selectDepth(marketId, Outcome.YES));
    const yes_price = yes_depth?.asks[0]?.price;
    const flash_ref = useRef<HTMLSpanElement>(null);
    const last_price = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (yes_price === undefined) return;
        const prev = last_price.current;
        last_price.current = yes_price;
        if (prev === undefined || prev === yes_price) return;
        const el = flash_ref.current;
        if (!el) return;
        const cls = yes_price > prev ? 'flash-up' : 'flash-down';
        el.classList.add(cls);
        const timer = setTimeout(() => el.classList.remove(cls), 380);
        return () => clearTimeout(timer);
    }, [yes_price]);

    const pct = yes_price !== undefined ? yes_price * 100 : null;
    const display =
        pct === null ? '—' : pct < 1 ? '<1%' : pct > 99 ? '>99%' : `${pct.toFixed(0)}%`;

    const delta_color =
        delta24hPct === null
            ? 'text-white/40'
            : delta24hPct >= 0
              ? 'text-emerald-300/90'
              : 'text-rose-300/90';
    const delta_sign = delta24hPct === null ? '' : delta24hPct >= 0 ? '▲' : '▼';
    const delta_value =
        delta24hPct === null ? '—' : `${Math.abs(delta24hPct).toFixed(1)}%`;

    return (
        <div className="flex items-baseline gap-4">
            <span ref={flash_ref} className="text-4xl font-medium text-yellow-300/90 tabular-nums">
                {display}
            </span>
            <span className="text-[11px] tracking-[0.25em] uppercase text-white/40">CHANCE</span>
            <span className={`font-mono text-xs tabular-nums ${delta_color}`}>
                {delta_sign} {delta_value}
            </span>
        </div>
    );
}

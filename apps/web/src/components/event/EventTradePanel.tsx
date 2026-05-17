'use client';
import { JSX, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { MarketDTO } from '@solmarket/types';
import { usePortfolioSync } from '@/hooks/usePortfolioSync';
import ResolvedPanel from './ResolvedPanel';
import AwaitingResolutionPanel from './AwaitingResolutionPanel';
import TradeForm from './TradeForm';

interface Props {
    market: MarketDTO;
}

/**
 * Fast-moving markets need to flip from "open trading" into "awaiting
 * resolution" the moment their slot's `endAt` passes — but we can't read
 * `Date.now()` during render (impure). This hook returns whether the slot
 * has ended and schedules a single `setTimeout` to flip it the instant the
 * wall-clock crosses `endAt`, so the panel transitions without requiring
 * an external re-render.
 */
function useSlotEnded(end_at: string | Date | null | undefined, enabled: boolean): boolean {
    const [ended, set_ended] = useState<boolean>(false);

    useEffect(() => {
        if (!enabled || end_at == null) return;
        const target = new Date(end_at).getTime();
        const delay = Math.max(0, target - Date.now());
        // setState lives in the timer callback (not the effect body) so the
        // "no synchronous setState in effects" lint rule is satisfied. A
        // 0ms timeout covers the already-past case in the same way.
        const timer = setTimeout(() => set_ended(true), delay);
        return () => clearTimeout(timer);
    }, [end_at, enabled]);

    // Gate by `enabled` at read-time so the caller can flip the question off
    // (e.g. market becomes RESOLVED) without us having to reset state from
    // inside the effect.
    return enabled && ended;
}

export default function EventTradePanel({ market }: Props): JSX.Element {
    usePortfolioSync();

    const is_resolved = market.status === 'RESOLVED';
    // Intermediate state: slot's wall-clock window has passed but the
    // server hasn't recorded a resolution yet. For fast-moving markets
    // we collapse on-chain resolve into the same poll tick (see
    // hedger/market-status/poller), so this window is typically a few
    // seconds — but we still render a distinct panel so the user
    // doesn't see a stale Buy/Sell UI for a slot that's already ended.
    const slot_ended = useSlotEnded(market.endAt, !is_resolved && market.kind === 'FAST_MOVING');
    const is_awaiting_resolution = !is_resolved && market.kind === 'FAST_MOVING' && slot_ended;

    return (
        <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="rounded-lg bg-dark-base p-1"
        >
            {is_resolved ? (
                <ResolvedPanel market={market} />
            ) : is_awaiting_resolution ? (
                <AwaitingResolutionPanel />
            ) : (
                <TradeForm market={market} />
            )}
        </motion.aside>
    );
}

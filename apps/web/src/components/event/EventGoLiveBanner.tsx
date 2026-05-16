'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { HiArrowRight } from 'react-icons/hi2';
import type { MarketDTO } from '@solmarket/types';
import { fetchPublicMarkets } from '@/lib/api/markets';
import { find_live_slot, is_slot_live } from '@/utils/fast-series';

/**
 * Shown above the trade panel on FAST_MOVING event pages when the
 * current slot's window doesn't include "now" — either the slot has
 * already resolved or it hasn't opened yet. One click fetches the
 * live slot for the same series and routes the user there.
 *
 * Renders nothing for STANDARD markets and for fast-moving slots
 * whose window currently contains `now` (no point offering to
 * navigate away from the slot the user is already trading).
 */
export default function EventGoLiveBanner({ market }: { market: MarketDTO }): JSX.Element | null {
    const router = useRouter();
    const [tick, set_tick] = useState(0);
    const [loading, set_loading] = useState(false);

    // The "is this slot live now" check depends on the wall clock, so
    // we re-evaluate every second. Cheap (just a Date.now comparison)
    // and matches the resolution of the underlying timestamps.
    useEffect(() => {
        const id = setInterval(() => set_tick((t) => t + 1), 1_000);
        return () => clearInterval(id);
    }, []);

    if (!market.fastSeriesKey) return null;
    // Reference `tick` so the eslint/react deps catch the re-render
    // dependency on the wall clock without a no-op variable.
    void tick;
    if (is_slot_live(market)) return null;

    const handle_click = async () => {
        if (loading) return;
        set_loading(true);
        try {
            const markets = await fetchPublicMarkets();
            const live = find_live_slot(markets, market.fastSeriesKey!);
            if (!live) {
                toast.error('No live round available yet — try again in a few seconds.');
                return;
            }
            if (live.id === market.id) {
                // Edge case: the API now reports this slot as live (a few
                // seconds may have passed). Nothing to do — just toast.
                toast.success('You are on the live round.');
                return;
            }
            router.push(`/event/${live.id}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'failed to load live round');
        } finally {
            set_loading(false);
        }
    };

    const slot_status = (() => {
        const end = new Date(market.endAt).getTime();
        if (!Number.isFinite(end)) return 'This slot';
        return Date.now() >= end ? 'This round has ended' : 'This round hasn’t started yet';
    })();

    return (
        <button
            type="button"
            onClick={handle_click}
            disabled={loading}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-400/25 bg-amber-400/8 hover:bg-amber-400/12 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
            <div className="min-w-0">
                <div className="text-[10px] tracking-[0.25em] uppercase text-amber-300/80">
                    Out of window
                </div>
                <div className="mt-1 text-[13px] text-white/85">
                    {slot_status} — jump to the live round.
                </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase text-amber-200">
                {loading ? 'Finding…' : 'Go live'}
                <HiArrowRight className="text-[13px]" />
            </span>
        </button>
    );
}

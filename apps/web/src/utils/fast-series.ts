import type { MarketDTO } from '@solmarket/types';

/** Slot duration in ms inferred from a `fastSeriesKey` suffix
 *  (`-5m`, `-15m`, `-1h`). Returns 0 when the suffix isn't recognised —
 *  callers should treat that as "cadence unknown" and degrade gracefully.
 *
 *  Centralised here so the dashboard grouping logic, the event-page
 *  live-round banner, and any future series-aware code all parse the
 *  cadence the same way. */
export function cadence_ms_for_series(series_key: string): number {
    const m = series_key.match(/-(\d+)([mh])$/i);
    if (!m) return 0;
    const value = parseInt(m[1]!, 10);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return m[2]!.toLowerCase() === 'h' ? value * 60 * 60 * 1000 : value * 60 * 1000;
}

/** True when `now` falls inside the slot's tradable window
 *  (`endAt - cadence ≤ now < endAt`). Used by the event page to decide
 *  whether to show the "Go to live round" banner — a market that's
 *  either already resolved or hasn't started yet should offer the
 *  user a one-click jump to the slot they can actually trade. */
export function is_slot_live(market: Pick<MarketDTO, 'endAt' | 'fastSeriesKey'>): boolean {
    if (!market.fastSeriesKey) return false;
    const cadence_ms = cadence_ms_for_series(market.fastSeriesKey);
    if (cadence_ms <= 0) return false;
    const end = new Date(market.endAt).getTime();
    if (!Number.isFinite(end)) return false;
    const now = Date.now();
    return end - cadence_ms <= now && now < end;
}

/** Pick the currently-tradable slot for a fast-moving series, given a
 *  pool of MarketDTOs (typically the result of `fetchPublicMarkets()`).
 *  Returns the slot where `start ≤ now < end`; if no slot qualifies,
 *  returns the earliest unended slot in the same series; if even that
 *  doesn't exist, returns null. */
export function find_live_slot(
    markets: MarketDTO[],
    series_key: string,
): MarketDTO | null {
    const now = Date.now();
    const cadence_ms = cadence_ms_for_series(series_key);
    const candidates = markets.filter(
        (m) => m.fastSeriesKey === series_key && new Date(m.endAt).getTime() > now,
    );
    if (candidates.length === 0) return null;
    if (cadence_ms > 0) {
        const live = candidates.find((m) => {
            const end = new Date(m.endAt).getTime();
            return end - cadence_ms <= now && now < end;
        });
        if (live) return live;
    }
    candidates.sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
    return candidates[0] ?? null;
}

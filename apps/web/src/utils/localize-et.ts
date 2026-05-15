/**
 * Polymarket prints fast-moving market titles with the slot window in
 * Eastern Time, e.g.
 *
 *   "Bitcoin Up or Down - May 14, 2:15PM-2:20PM ET"
 *
 * That's right for Polymarket's NYC-centric audience but disorienting
 * for an Indian user trying to figure out whether the slot is happening
 * right now. This helper detects the "ET" pattern and rewrites it into
 * the viewer's local timezone, leaving the prefix and outcome untouched
 * so the title still reads naturally:
 *
 *   "Bitcoin Up or Down - May 14, 11:45PM-11:50PM IST"
 *
 * Display-only — the underlying `market.name` is unchanged in the DB
 * and on the API.
 *
 * Returns the original string when:
 *   - the title doesn't contain the "<date>, HHaM-HHaM ET" suffix
 *   - the times fail to parse
 *   - the browser can't resolve a timezone (very rare; very old engines)
 */

const MONTHS: Record<string, number> = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12,
};

/** Best-effort ET offset for a given calendar date. Uses Intl with
 *  America/New_York to read off EDT vs EST, which is correct across DST
 *  transitions without us shipping a tz database. Falls back to EST
 *  (-5) when the host VM can't resolve the zone. */
function et_offset_hours(year: number, month: number, day: number): number {
    try {
        const probe = new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            timeZoneName: 'short',
        }).formatToParts(probe);
        const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'EST';
        return name === 'EDT' ? -4 : -5;
    } catch {
        return -5;
    }
}

function parse_et_time(date_str: string, time_str: string, year: number): Date | null {
    const dm = date_str.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    if (!dm) return null;
    const monthKey = (dm[1]!.slice(0, 1).toUpperCase() + dm[1]!.slice(1, 3).toLowerCase()) as keyof typeof MONTHS;
    const month = MONTHS[monthKey];
    if (!month) return null;
    const day = parseInt(dm[2]!, 10);
    const tm = time_str.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!tm) return null;
    let hour = parseInt(tm[1]!, 10);
    const minute = parseInt(tm[2]!, 10);
    const ampm = tm[3]!.toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const offset = et_offset_hours(year, month, day);
    const sign = offset < 0 ? '-' : '+';
    const off_h = String(Math.abs(offset)).padStart(2, '0');
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${off_h}:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function short_tz_label(d: Date): string {
    try {
        const parts = new Intl.DateTimeFormat(undefined, {
            timeZoneName: 'short',
        }).formatToParts(d);
        return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    } catch {
        return '';
    }
}

function format_local_date(d: Date): string {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
}

function format_local_time(d: Date): string {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
}

const ET_WINDOW_RE =
    /(.+?\s-\s)([A-Za-z]+\s+\d{1,2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s+ET\b/i;

/** Convert any "<date>, HH:MMaM-HH:MMaM ET" window inside `title` to the
 *  viewer's local timezone. Year is inferred from the current date —
 *  the slot windows we see are always within a few days of "now", so
 *  this is robust except across the literal Dec 31 → Jan 1 boundary,
 *  which we accept as a non-issue. */
export function localize_market_title(title: string): string {
    const m = title.match(ET_WINDOW_RE);
    if (!m) return title;
    const [, prefix, date_str, start_t, end_t] = m;
    const year = new Date().getFullYear();
    const start = parse_et_time(date_str!, start_t!, year);
    const end = parse_et_time(date_str!, end_t!, year);
    if (!start || !end) return title;
    // Wrap past midnight if the end time appears earlier than the start —
    // happens when the slot crosses 12am ET. Bump end forward one day.
    if (end.getTime() < start.getTime()) {
        end.setDate(end.getDate() + 1);
    }
    const tz_label = short_tz_label(start);
    return `${prefix}${format_local_date(start)}, ${format_local_time(start)}-${format_local_time(end)}${
        tz_label ? ' ' + tz_label : ''
    }`;
}

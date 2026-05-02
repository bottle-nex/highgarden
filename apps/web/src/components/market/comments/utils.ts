export function relative_time(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    const ms = Date.now() - date.getTime();
    if (Number.isNaN(ms)) return '';
    const sec = Math.max(Math.floor(ms / 1000), 0);
    if (sec < 5) return 'now';
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}mo`;
    const year = Math.floor(day / 365);
    return `${year}y`;
}

export function initials_from(name: string | null | undefined): string {
    if (!name) return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase();
    return ((parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')).toUpperCase();
}

export function format_position_usd(usd: number): string {
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
    return `$${usd.toFixed(0)}`;
}

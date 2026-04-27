/**
 * Admin gating for the curator dashboard.
 *
 * For MVP we use a simple email allowlist driven by the ADMIN_EMAILS env var
 * (comma-separated). This runs server-side only, so the env var is not exposed
 * to the browser. Swap for a database-backed role later.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const raw = process.env.ADMIN_EMAILS ?? '';
    if (!raw.trim()) return false;
    const allowlist = raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return allowlist.includes(email.toLowerCase());
}

"use server";

import { SEND_OTP_URL } from "@/routes/routes.api";

export async function requestOtp(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const res = await fetch(SEND_OTP_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
            cache: "no-store",
        });
        const raw = await res.text();
        let json: { success?: boolean; message?: string } | null = null;
        try {
            json = raw ? JSON.parse(raw) : null;
        } catch {
            console.error("[requestOtp] non-JSON response", { url: SEND_OTP_URL, status: res.status, body: raw });
            return { ok: false, error: `Backend returned ${res.status}: ${raw.slice(0, 200)}` };
        }
        if (!res.ok || !json?.success) {
            console.error("[requestOtp] backend rejected", { url: SEND_OTP_URL, status: res.status, body: json });
            return { ok: false, error: json?.message ?? `Backend returned ${res.status}` };
        }
        return { ok: true };
    } catch (err) {
        console.error("[requestOtp] fetch threw", { url: SEND_OTP_URL, err });
        return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
}

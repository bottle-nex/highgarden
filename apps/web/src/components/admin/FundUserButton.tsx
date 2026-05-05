'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fundUserByEmail, type FundUserResult } from '@/lib/api/admin';

interface FormState {
    email: string;
    sol: string;
    usdcAmount: string;
}

const EMPTY_FORM: FormState = { email: '', sol: '', usdcAmount: '' };

const LAMPORTS_PER_SOL = 1_000_000_000;

export default function FundUserButton() {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const wrapper_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handle = (e: MouseEvent) => {
            if (!wrapper_ref.current) return;
            if (wrapper_ref.current.contains(e.target as Node)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [open]);

    const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value }));

    const reset = () => setForm(EMPTY_FORM);

    const validate = ():
        | { ok: true; payload: { email: string; solLamports?: number; usdcAmount?: number } }
        | { ok: false; reason: string } => {
        const email = form.email.trim();
        if (!email || !email.includes('@')) return { ok: false, reason: 'Enter a valid email' };
        const sol = form.sol.trim() === '' ? undefined : Number(form.sol);
        const usdc = form.usdcAmount.trim() === '' ? undefined : Number(form.usdcAmount);
        if (sol === undefined && usdc === undefined) {
            return { ok: false, reason: 'Enter SOL or USDC amount' };
        }
        if (sol !== undefined && (!Number.isFinite(sol) || sol < 0)) {
            return { ok: false, reason: 'SOL must be a non-negative number' };
        }
        if (usdc !== undefined && (!Number.isFinite(usdc) || usdc < 0)) {
            return { ok: false, reason: 'USDC must be a non-negative number' };
        }
        const lamports = sol === undefined ? undefined : Math.round(sol * LAMPORTS_PER_SOL);
        return { ok: true, payload: { email, solLamports: lamports, usdcAmount: usdc } };
    };

    const handle_submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        const validation = validate();
        if (!validation.ok) {
            toast.error(validation.reason);
            return;
        }
        setPending(true);
        try {
            const result = await fundUserByEmail(validation.payload);
            announce_success(result);
            reset();
            setOpen(false);
        } catch (err: unknown) {
            announce_error(err);
        } finally {
            setPending(false);
        }
    };

    return (
        <div ref={wrapper_ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="h-9 px-4 rounded text-[10px] tracking-[0.25em] uppercase border border-white/15 hover:bg-white/5 text-white/75"
            >
                Fund user
            </button>

            {open && (
                <form
                    onSubmit={handle_submit}
                    className="absolute right-0 mt-2 w-80 z-20 rounded-md border border-white/10 bg-[#111] shadow-xl p-4 space-y-3"
                >
                    <div>
                        <label className="block text-[10px] tracking-[0.2em] uppercase text-white/45 mb-1">
                            User email
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={update('email')}
                            placeholder="user@example.com"
                            autoFocus
                            required
                            className="w-full h-9 px-2 bg-white/5 border border-white/10 rounded text-xs text-white outline-none focus:border-white/30"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] tracking-[0.2em] uppercase text-white/45 mb-1">
                            SOL
                        </label>
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.001"
                            value={form.sol}
                            onChange={update('sol')}
                            placeholder="0.05"
                            className="w-full h-9 px-2 bg-white/5 border border-white/10 rounded text-xs text-white outline-none focus:border-white/30"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] tracking-[0.2em] uppercase text-white/45 mb-1">
                            USDC
                        </label>
                        <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={form.usdcAmount}
                            onChange={update('usdcAmount')}
                            placeholder="1"
                            className="w-full h-9 px-2 bg-white/5 border border-white/10 rounded text-xs text-white outline-none focus:border-white/30"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                reset();
                                setOpen(false);
                            }}
                            disabled={pending}
                            className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase text-white/55 hover:text-white/85 disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={pending}
                            className="h-8 px-4 rounded text-[10px] tracking-[0.2em] uppercase bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                        >
                            {pending ? 'Funding…' : 'Fund'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

function announce_success(result: FundUserResult): void {
    const parts: string[] = [];
    if (result.solTxSignature) parts.push('SOL sent');
    if (result.usdcTxSignature) parts.push('USDC minted');
    const summary = parts.length > 0 ? parts.join(' + ') : 'no transfers';
    toast.success(`Funded ${result.email}: ${summary}`, {
        duration: 15000,
        description: <FundSuccessDetails result={result} />,
    });
}

function FundSuccessDetails({ result }: { result: FundUserResult }) {
    return (
        <div className="space-y-2 mt-1">
            <div className="text-[11px] text-white/60">
                <span className="text-white/40">Wallet</span>{' '}
                <span className="font-mono">{short_pubkey(result.userPubkey)}</span>
                <button
                    type="button"
                    onClick={() => copy_to_clipboard(result.userPubkey, 'Wallet copied')}
                    className="ml-2 text-[10px] tracking-[0.16em] uppercase text-white/55 hover:text-white"
                >
                    Copy
                </button>
            </div>
            {result.solTxSignature && (
                <TxSignatureRow label="SOL tx" signature={result.solTxSignature} />
            )}
            {result.usdcTxSignature && (
                <TxSignatureRow label="USDC tx" signature={result.usdcTxSignature} />
            )}
        </div>
    );
}

function TxSignatureRow({ label, signature }: { label: string; signature: string }) {
    const explorer = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    return (
        <div className="flex items-center justify-between gap-2 text-[11px] text-white/60">
            <span className="shrink-0">
                <span className="text-white/40">{label}</span>{' '}
                <span className="font-mono tabular-nums">
                    {signature.slice(0, 8)}…{signature.slice(-6)}
                </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
                <button
                    type="button"
                    onClick={() => copy_to_clipboard(signature, `${label} copied`)}
                    className="text-[10px] tracking-[0.16em] uppercase px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/14 text-white/70 hover:text-white transition-colors"
                >
                    Copy
                </button>
                <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] tracking-[0.16em] uppercase px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/14 text-white/70 hover:text-white transition-colors"
                >
                    Explorer ↗
                </a>
            </span>
        </div>
    );
}

function copy_to_clipboard(text: string, success_message: string): void {
    navigator.clipboard
        .writeText(text)
        .then(() => toast.success(success_message))
        .catch(() => toast.error('Could not copy. Select the text manually.'));
}

function announce_error(err: unknown): void {
    const e = err as {
        response?: { data?: { error?: { code?: string }; message?: string } };
    };
    const code = e.response?.data?.error?.code;
    const friendly_messages: Record<string, string> = {
        USER_NOT_FOUND: 'No user with that email.',
        USER_NO_WALLET: 'User has not yet created a custodial wallet.',
        ADMIN_KEYPAIR_MISSING: 'Server is not configured for funding.',
        NOT_AUTHORIZED: 'Admins only.',
        INVALID_DATA: 'Invalid input. Check the values.',
        FUND_FAILED: 'Funding transaction failed. See server logs.',
    };
    const msg =
        code && friendly_messages[code]
            ? friendly_messages[code]
            : (e.response?.data?.message ?? 'Funding failed');
    toast.error(msg);
}

function short_pubkey(pubkey: string): string {
    if (pubkey.length <= 12) return pubkey;
    return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { fetchPausedMarkets, resumePausedMarket, type AdminPausedMarket } from '@/lib/api/admin';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function PausedMarketsPanel() {
    const { status: sessionStatus } = useSession();
    const session = useUserSessionStore((state) => state.session);
    const hasToken = !!session?.user?.token;
    const [rows, setRows] = useState<AdminPausedMarket[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        if (!hasToken) return;
        const controller = new AbortController();
        fetchPausedMarkets(controller.signal)
            .then((markets) => {
                if (!controller.signal.aborted) setRows(markets);
            })
            .catch((err: unknown) => {
                if (!controller.signal.aborted) {
                    setLoadError(
                        err instanceof Error ? err.message : 'Could not load paused markets.',
                    );
                }
            });
        return () => controller.abort();
    }, [hasToken, loadAttempt]);

    const handleResume = async (market: AdminPausedMarket) => {
        if (busyId || market.resumeUnavailableReason) return;
        setBusyId(market.marketId);
        try {
            const result = await resumePausedMarket(market.marketId);
            setRows(
                (current) => current?.filter((row) => row.marketId !== result.marketId) ?? null,
            );
            toast.success(`Hedge pause cleared for ${market.name}`, {
                description: result.exposureCapReached
                    ? 'The exposure limit still blocks trades.'
                    : undefined,
            });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not resume this market.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section aria-labelledby="paused-markets-heading" className="space-y-3">
            <h2 id="paused-markets-heading" className="text-lg tracking-wide text-white">
                Paused markets
            </h2>
            {sessionStatus === 'unauthenticated' || (session && !hasToken) ? (
                <p role="alert" className="text-xs text-rose-300">
                    Sign in again to load paused markets.
                </p>
            ) : hasToken && loadError ? (
                <div className="flex items-center gap-3 text-xs">
                    <p role="alert" className="text-rose-300">
                        {loadError}
                    </p>
                    <button
                        type="button"
                        className="rounded bg-white/5 px-3 py-2 text-white/70 hover:bg-white/10"
                        onClick={() => {
                            setLoadError(null);
                            setLoadAttempt((attempt) => attempt + 1);
                        }}
                    >
                        Retry
                    </button>
                </div>
            ) : !hasToken || rows === null ? (
                <p role="status" className="text-xs text-white/40">
                    Loading paused markets…
                </p>
            ) : rows.length === 0 ? (
                <p className="rounded border border-dashed border-white/10 p-6 text-center text-xs text-white/40">
                    No paused markets.
                </p>
            ) : (
                <ul className="space-y-2">
                    {rows.map((market) => (
                        <li
                            key={market.marketId}
                            className="flex items-center justify-between gap-3 rounded border border-white/8 bg-white/[0.02] p-3"
                        >
                            <div className="min-w-0 space-y-1">
                                <p className="text-sm text-white">{market.name}</p>
                                <p className="break-words text-xs text-white/60">
                                    {market.reasons.join(' · ')}
                                </p>
                                <p className="text-xs text-white/50">
                                    Unhedged {usd.format(market.unhedgedUsd)} USD
                                </p>
                                {market.exposureCapReached && (
                                    <p className="text-xs text-amber-300">
                                        Exposure limit reached.
                                    </p>
                                )}
                                {market.resumeUnavailableReason && (
                                    <p className="text-xs text-white/50">
                                        {market.resumeUnavailableReason}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                disabled={
                                    busyId !== null || market.resumeUnavailableReason !== null
                                }
                                onClick={() => void handleResume(market)}
                                className="green-btn h-8 shrink-0 rounded px-3 text-[10px] uppercase tracking-[0.2em] disabled:opacity-40"
                            >
                                {busyId === market.marketId ? 'Resuming…' : 'Resume'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

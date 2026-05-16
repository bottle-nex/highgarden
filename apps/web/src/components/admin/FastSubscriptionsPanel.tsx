'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    fetchFastSubscriptions,
    unsubscribeFastSeries,
    type FastSubscription,
} from '@/lib/api/admin';

/**
 * Lists active fast-moving series subscriptions and lets the admin
 * unsubscribe. When admin unsubscribes, ONLY future auto-approvals
 * stop — markets already approved keep running until they resolve.
 */
export default function FastSubscriptionsPanel({ onChange }: { onChange?: () => void }) {
    const [rows, setRows] = useState<FastSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const data = await fetchFastSubscriptions();
            setRows(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
         
        void refresh();
    }, [refresh]);

    const handle_unsubscribe = async (id: string, label: string) => {
        if (busyId) return;
        setBusyId(id);
        try {
            await unsubscribeFastSeries(id);
            toast.success(`Unsubscribed from ${label}`);
            await refresh();
            onChange?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'unsubscribe failed');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="text-xs text-white/40">Loading subscriptions…</div>;
    }
    if (rows.length === 0) {
        return (
            <div className="border border-dashed border-white/10 rounded p-6 text-center text-xs text-white/40">
                No active subscriptions. Click <span className="text-amber-300">Subscribe</span> on a fast-moving market row to start auto-approving every new market in that series.
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {rows.map((s) => (
                <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 p-3 border border-white/8 rounded bg-white/[0.02]"
                >
                    <div className="min-w-0">
                        <p className="text-sm text-white truncate">{s.label}</p>
                        <p className="text-[10px] tracking-wider uppercase text-white/40 mt-0.5">
                            {s.seriesKey}
                            {s.createdBy && <span> · added by {s.createdBy}</span>}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={busyId === s.id}
                        onClick={() => handle_unsubscribe(s.id, s.label)}
                        className="shrink-0 h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-40"
                    >
                        {busyId === s.id ? 'Removing…' : 'Unsubscribe'}
                    </button>
                </li>
            ))}
        </ul>
    );
}

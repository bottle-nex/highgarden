'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { runAutoLister } from '@/lib/api/admin';

export default function RunListerButton({ onComplete }: { onComplete?: () => void }) {
    const [pending, setPending] = useState(false);

    const handleClick = async () => {
        if (pending) return;
        setPending(true);
        try {
            const result = await runAutoLister();
            toast.success(
                `Discovered ${result.discovered} new · ${result.skippedExisting} known · ${result.failed} failed`,
            );
            onComplete?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'lister failed');
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            disabled={pending}
            onClick={handleClick}
            className="h-9 px-4 rounded text-[10px] tracking-[0.25em] uppercase border border-white/15 hover:bg-white/5 text-white/75 disabled:opacity-50"
        >
            {pending ? 'Running…' : 'Run auto-lister'}
        </button>
    );
}

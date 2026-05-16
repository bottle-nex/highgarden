'use client';
import { JSX, useMemo } from 'react';
import { LuChevronsUpDown, LuExternalLink } from 'react-icons/lu';
import type { FillDTO } from '@solmarket/types';
import { Outcome, Side } from '@solmarket/types';
import { cn } from '@/lib/utils';
import { selectAllFills, selectFillsLoading, useFillsStore } from '@/store/portfolio/useFillsStore';
import EmptyTabState from './EmptyTabState';
import { localize_market_title } from '@/utils/localize-et';

const COLUMN_HEADERS = ['Market', 'Action', 'Price', 'Shares', 'Total', 'When'];

const SOLSCAN_BASE = 'https://solscan.io/tx/';

export default function HistoryTable({ search }: { search: string }): JSX.Element {
    const fills = useFillsStore(selectAllFills);
    const loading = useFillsStore(selectFillsLoading);

    const filtered = useMemo(() => {
        if (!search.trim()) return fills;
        const q = search.toLowerCase();
        return fills.filter((f) => f.marketName.toLowerCase().includes(q));
    }, [fills, search]);

    if (loading && fills.length === 0) {
        return (
            <div className="mt-8 py-16 text-center text-white/40 text-sm border border-neutral-900 bg-dark-alpha">
                Loading history…
            </div>
        );
    }

    if (filtered.length === 0) {
        return <EmptyTabState label="History" />;
    }

    return (
        <div className="mt-4">
            <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_auto] gap-x-4 px-2 pb-3 text-xs text-white/50 uppercase tracking-wide">
                {COLUMN_HEADERS.map((header) => (
                    <div key={header} className="flex items-center gap-x-1">
                        {header} <LuChevronsUpDown className="size-3" />
                    </div>
                ))}
                <div />
            </div>
            {filtered.map((fill) => (
                <HistoryRow key={fill.id} fill={fill} />
            ))}
        </div>
    );
}

function HistoryRow({ fill }: { fill: FillDTO }): JSX.Element {
    const isBuy = fill.side === Side.BUY;
    const isYes = fill.outcome === Outcome.YES;
    const total_usd = (fill.priceCents * fill.size) / 100;

    return (
        <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_auto] gap-x-4 items-center px-2 py-3 border-t border-neutral-900">
            <div className="min-w-0">
                <p className="text-sm text-white truncate">
                    {localize_market_title(fill.marketName)}
                </p>
            </div>
            <div className="flex items-center gap-x-2">
                <span
                    className={cn(
                        'text-[10px] px-1.5 py-0.5 font-semibold tracking-wider',
                        isBuy
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-rose-500/15 text-rose-400',
                    )}
                >
                    {isBuy ? 'BUY' : 'SELL'}
                </span>
                <span
                    className={cn(
                        'text-[10px] px-1.5 py-0.5 font-semibold tracking-wider',
                        isYes ? 'bg-primary/15 text-primary' : 'bg-red-500/15 text-red-400',
                    )}
                >
                    {isYes ? 'YES' : 'NO'}
                </span>
            </div>
            <div className="text-sm text-white/70 tabular-nums">{fill.priceCents}¢</div>
            <div className="text-sm text-white/70 tabular-nums">{fill.size.toLocaleString()}</div>
            <div className="text-sm text-white tabular-nums">${total_usd.toFixed(2)}</div>
            <div className="text-sm text-white/50">{format_when(fill.createdAt)}</div>
            <a
                href={`${SOLSCAN_BASE}${fill.txSig}`}
                target="_blank"
                rel="noreferrer"
                className="text-white/40 hover:text-white p-2"
                aria-label="View transaction"
            >
                <LuExternalLink className="size-4" />
            </a>
        </div>
    );
}

function format_when(iso: string): string {
    const ts = new Date(iso).getTime();
    const diff_sec = Math.max(0, (Date.now() - ts) / 1000);
    if (diff_sec < 60) return 'just now';
    if (diff_sec < 3600) return `${Math.floor(diff_sec / 60)}m ago`;
    if (diff_sec < 86400) return `${Math.floor(diff_sec / 3600)}h ago`;
    if (diff_sec < 86400 * 7) return `${Math.floor(diff_sec / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

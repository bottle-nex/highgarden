'use client';
import { JSX, ReactNode, useMemo } from 'react';
import { LuExternalLink } from 'react-icons/lu';
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
            <div className="mt-6 py-16 text-center text-white/40 text-sm border border-white/8 bg-dark-base rounded-lg">
                Loading history…
            </div>
        );
    }

    if (filtered.length === 0) {
        return <EmptyTabState label="History" />;
    }

    return (
        <div className="mt-5">
            <div className="hidden md:grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_56px] gap-x-4 px-2 pb-3 text-[10px] font-medium text-white/40 uppercase tracking-[0.14em] border-b border-white/8">
                {COLUMN_HEADERS.map((header, idx) => (
                    <div
                        key={header}
                        className={
                            idx === 0 ? 'flex items-center' : 'flex items-center justify-end'
                        }
                    >
                        {header}
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

function HistoryStat({ label, children }: { label: string; children: ReactNode }): JSX.Element {
    return (
        <div className="md:hidden flex flex-col gap-y-0.5">
            <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
            <div className="text-sm text-white/85 tabular-nums">{children}</div>
        </div>
    );
}

function HistoryRow({ fill }: { fill: FillDTO }): JSX.Element {
    const isBuy = fill.side === Side.BUY;
    const isYes = fill.outcome === Outcome.YES;
    const total_usd = (fill.priceCents * fill.size) / 100;

    return (
        <div className="flex flex-col gap-y-3 md:grid md:grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_56px] md:gap-x-4 md:items-center px-2 py-4 md:py-3 border-t border-white/[0.06] hover:bg-white/[0.015] transition-colors">
            <div className="flex items-start justify-between gap-x-3 md:block min-w-0">
                <p className="text-sm text-white truncate font-medium md:font-normal flex-1">
                    {localize_market_title(fill.marketName)}
                </p>
                <a
                    href={`${SOLSCAN_BASE}${fill.txSig}`}
                    target="_blank"
                    rel="noreferrer"
                    className="md:hidden text-white/40 hover:text-white p-1 shrink-0"
                    aria-label="View transaction"
                >
                    <LuExternalLink className="size-4" />
                </a>
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 md:contents">
                <div className="md:hidden flex flex-col gap-y-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                        Action
                    </span>
                    <div className="flex items-center gap-x-2">
                        <span
                            className={cn(
                                'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider',
                                isBuy
                                    ? 'bg-emerald-600/90 text-white'
                                    : 'bg-rose-500/90 text-white',
                            )}
                        >
                            {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        <span
                            className={cn(
                                'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider',
                                isYes ? 'bg-alpha text-white' : 'bg-rose-500/90 text-white',
                            )}
                        >
                            {isYes ? 'YES' : 'NO'}
                        </span>
                    </div>
                </div>
                <div className="hidden md:flex items-center justify-end gap-x-2">
                    <span
                        className={cn(
                            'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider',
                            isBuy ? 'bg-emerald-600/90 text-white' : 'bg-rose-500/90 text-white',
                        )}
                    >
                        {isBuy ? 'BUY' : 'SELL'}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wider',
                            isYes ? 'bg-alpha text-white' : 'bg-rose-500/90 text-white',
                        )}
                    >
                        {isYes ? 'YES' : 'NO'}
                    </span>
                </div>
                <HistoryStat label="Price">{fill.priceCents}¢</HistoryStat>
                <div className="hidden md:block text-sm text-white/75 tabular-nums text-right">
                    {fill.priceCents}¢
                </div>
                <HistoryStat label="Shares">{fill.size.toLocaleString()}</HistoryStat>
                <div className="hidden md:block text-sm text-white/75 tabular-nums text-right">
                    {fill.size.toLocaleString()}
                </div>
                <HistoryStat label="Total">${total_usd.toFixed(2)}</HistoryStat>
                <div className="hidden md:block text-sm text-white tabular-nums text-right">
                    ${total_usd.toFixed(2)}
                </div>
                <HistoryStat label="When">{format_when(fill.createdAt)}</HistoryStat>
                <div className="hidden md:block text-sm text-white/50 text-right">
                    {format_when(fill.createdAt)}
                </div>
                <a
                    href={`${SOLSCAN_BASE}${fill.txSig}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden md:flex text-white/40 hover:text-white p-2 items-center justify-end transition-colors"
                    aria-label="View transaction"
                >
                    <LuExternalLink className="size-4" />
                </a>
            </div>
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

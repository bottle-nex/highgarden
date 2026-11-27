'use client';
import { JSX, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { LuExternalLink } from 'react-icons/lu';
import type { ActivityDTO } from '@solmarket/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useActivity } from '@/hooks/useActivity';
import { localize_market_title } from '@/utils/localize-et';
import EmptyTabState from './EmptyTabState';

const KIND_LABELS = {
    DEPOSIT: 'Deposit',
    WITHDRAWAL: 'Withdrawal',
    CLAIM: 'Claim',
    TRADE: 'Trade',
};
const STATUS_LABELS = { PENDING: 'Pending', DONE: 'Done', FAILED: 'Failed' };

/** Format raw units without converting a potentially large balance to floating point. */
export function format_activity_amount(raw: string, decimals: number): string {
    const value = BigInt(raw);
    const multiplier = BigInt(10) ** BigInt(decimals);
    const fraction = (value % multiplier).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${(value / multiplier).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

export default function ActivityTable({ search }: { search: string }): JSX.Element {
    const container = useRef<HTMLDivElement | null>(null);
    const anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
    const capture_anchor = useCallback(() => {
        const rows = container.current?.querySelectorAll<HTMLElement>('[data-activity-row]');
        const visible =
            rows &&
            [...rows].find((row) => {
                const rect = row.getBoundingClientRect();
                return rect.bottom > 0 && rect.top < window.innerHeight;
            });
        anchor.current = visible
            ? { element: visible, top: visible.getBoundingClientRect().top }
            : null;
    }, []);
    const { items, initialLoading, loading, error, exhausted, loadMore, retry } = useActivity(
        search,
        capture_anchor,
    );
    useLayoutEffect(() => {
        const previous = anchor.current;
        anchor.current = null;
        if (previous?.element.isConnected) {
            const delta = previous.element.getBoundingClientRect().top - previous.top;
            if (delta) window.scrollBy(0, delta);
        }
    }, [items]);
    const sentinel = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const node = sentinel.current;
        if (!node || exhausted || loading || error) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMore();
            },
            { rootMargin: '320px 0px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [items.length, exhausted, loading, error, loadMore]);

    if (initialLoading)
        return (
            <div
                className="mt-6 py-16 text-center text-white/40 text-sm border border-white/8 bg-dark-base rounded-lg"
                role="status"
            >
                Loading activity…
            </div>
        );
    return (
        <div ref={container} className="mt-5" aria-busy={loading}>
            {items.length === 0 &&
                !error &&
                (search.trim() ? (
                    <p className="py-16 text-center text-sm text-white/45">No matching activity</p>
                ) : (
                    <EmptyTabState label="Activity" />
                ))}
            {items.length > 0 && (
                <>
                    <div className="hidden md:grid grid-cols-[1fr_3fr_2fr_1fr_2fr_1fr] gap-x-4 px-2 pb-3 text-[10px] font-medium text-white/40 uppercase tracking-[0.14em] border-b border-white/8">
                        {['Type', 'Details', 'Amount', 'Status', 'When', 'Transaction'].map(
                            (label) => (
                                <div key={label}>{label}</div>
                            ),
                        )}
                    </div>
                    {items.map((item) => (
                        <ActivityRow key={item.id} item={item} />
                    ))}
                </>
            )}
            {error && (
                <div
                    className="py-4 text-sm text-white/65 flex items-center justify-center gap-3"
                    role="alert"
                >
                    <span>{error}</span>
                    <Button variant="outline" onClick={retry}>
                        Retry
                    </Button>
                </div>
            )}
            <div ref={sentinel} className="py-4 text-center text-xs text-white/40" role="status">
                {loading
                    ? 'Loading more…'
                    : exhausted && items.length > 0
                      ? 'End of activity'
                      : null}
            </div>
        </div>
    );
}

function ActivityRow({ item }: { item: ActivityDTO }): JSX.Element {
    return (
        <div
            data-activity-row
            className="flex flex-col gap-y-3 md:grid md:grid-cols-[1fr_3fr_2fr_1fr_2fr_1fr] md:gap-x-4 md:items-center px-2 py-4 border-t border-white/[0.06] text-sm"
        >
            <div className="font-medium text-white">
                {KIND_LABELS[item.kind]}
                {item.side && (
                    <span className="block text-xs text-white/45">
                        {item.side} {item.outcome}
                    </span>
                )}
            </div>
            <div className="min-w-0 text-white/75">
                {item.marketName ? (
                    localize_market_title(item.marketName)
                ) : item.destination ? (
                    <span className="break-all">To {item.destination}</span>
                ) : (
                    'SOL → USDC'
                )}
            </div>
            <div className="text-white tabular-nums">
                {format_activity_amount(item.amountRaw, item.unit === 'SOL' ? 9 : 6)} {item.unit}
                {item.kind === 'DEPOSIT' && item.convertedUsdcRaw !== null && (
                    <span className="block text-xs text-white/45">
                        {item.status === 'DONE' ? 'Converted: ' : 'Conversion amount: '}
                        {format_activity_amount(item.convertedUsdcRaw, 6)} USDC
                    </span>
                )}
            </div>
            <div>
                <span
                    className={cn(
                        'inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold',
                        item.status === 'DONE'
                            ? 'bg-emerald-600/90 text-white'
                            : item.status === 'FAILED'
                              ? 'bg-rose-500/90 text-white'
                              : 'bg-white/8 text-white/65',
                    )}
                >
                    {STATUS_LABELS[item.status]}
                </span>
                {item.status === 'FAILED' && item.error && (
                    <p className="mt-1 text-xs text-white/45 break-words">{item.error}</p>
                )}
            </div>
            <time dateTime={item.createdAt} className="text-white/50 text-xs">
                {new Date(item.createdAt).toLocaleString()}
            </time>
            <div className="flex flex-col gap-2 text-xs text-white/45">
                {item.transactions.length === 0
                    ? 'Not submitted'
                    : item.transactions.map((tx, index) =>
                          tx.url ? (
                              <a
                                  key={tx.signature}
                                  href={tx.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-white"
                                  aria-label={`View ${KIND_LABELS[item.kind].toLowerCase()} transaction ${index + 1}`}
                              >
                                  {item.kind === 'DEPOSIT' && item.transactions.length > 1
                                      ? index === 0
                                          ? 'Sweep'
                                          : 'Mint'
                                      : 'View transaction'}
                                  <LuExternalLink className="size-3.5" />
                              </a>
                          ) : (
                              <span key={tx.signature} title={tx.signature} className="break-all">
                                  {tx.signature}
                              </span>
                          ),
                      )}
            </div>
        </div>
    );
}

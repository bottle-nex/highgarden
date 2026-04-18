import { JSX } from 'react';
import { cn } from '@/lib/utils';
import { tickerTrades, type TickerTrade } from '@/utils/constants';

export default function MarketTicker(): JSX.Element {
    const stream = [...tickerTrades, ...tickerTrades];

    return (
        <div className="relative border border-white/10 bg-neutral-950 overflow-hidden rounded-[6px]">
            <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-2 bg-black border-r border-white/10 pl-5 pr-4 rounded-l-[6px]">
                <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 animate-ping opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500/80" />
                </span>
                <span className="font-mono text-[11px] tracking-[0.25em] text-white/65 uppercase">
                    LIVE
                </span>
            </div>

            <div className="pointer-events-none absolute left-19 top-0 bottom-0 w-12 z-10 bg-linear-to-r from-neutral-950 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-linear-to-l from-neutral-950 to-transparent" />

            <div className="pl-19">
                <div className="animate-marquee pause-on-hover py-3">
                    {stream.map((t, i) => (
                        <TradeItem key={`${t.id}-${i}`} trade={t} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function TradeItem({ trade }: { trade: TickerTrade }): JSX.Element {
    const isYes = trade.side === 'YES';
    return (
        <div className="flex items-center gap-2 px-5 whitespace-nowrap font-mono text-[12px] tracking-[0.12em] uppercase">
            <span className="text-white/55">{trade.market}</span>
            <span
                className={cn(
                    'px-2 py-0.5 rounded border',
                    isYes
                        ? 'border-emerald-500/25 text-emerald-500/70'
                        : 'border-rose-500/25 text-rose-500/70',
                )}
            >
                {trade.side} · {trade.price}¢
            </span>
            <span className="text-white/40">{trade.size}</span>
            <span className="text-white/15">·</span>
        </div>
    );
}

'use client';
import { JSX, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Market } from '@/utils/constants';
import MarketCard from './MarketCard';
import SectionHeading from './SectionHeading';

type SortKey = 'VOLUME' | '24H Δ' | 'ENDING SOON';

const SORTS: SortKey[] = ['VOLUME', '24H Δ', 'ENDING SOON'];

export default function MarketGrid({
    markets,
    get_href,
}: {
    markets: Market[];
    get_href?: (m: Market) => string;
}): JSX.Element {
    const [sort, setSort] = useState<SortKey>('VOLUME');

    const sorted = useMemo(() => {
        const arr = [...markets];
        if (sort === 'VOLUME') {
            return arr.sort((a, b) => parseVolume(b.volume) - parseVolume(a.volume));
        }
        if (sort === '24H Δ') {
            return arr.sort((a, b) => b.change24h - a.change24h);
        }
        return arr.sort((a, b) => parseEnds(a.endsIn) - parseEnds(b.endsIn));
    }, [markets, sort]);

    return (
        <section>
            <SectionHeading title="ACTIVE MARKETS" subtitle={`${markets.length} LIVE`} />

            <div className="mb-5 flex items-center gap-1 border border-gray-500/15 bg-dark-base p-1 rounded-sm w-fit">
                {SORTS.map((key) => {
                    const isActive = sort === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSort(key)}
                            className={cn(
                                'px-3 py-1.5 rounded-xs text-[9px] tracking-[0.22em] uppercase transition-colors cursor-pointer',
                                isActive
                                    ? 'bg-white/10 text-white/80'
                                    : 'text-white/40 hover:text-white/65',
                            )}
                        >
                            {key}
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
                {sorted.map((m) => (
                    <MarketCard key={m.id} market={m} href={get_href?.(m)} />
                ))}
            </div>
        </section>
    );
}

function parseVolume(v: string): number {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    if (v.includes('M')) return n * 1_000_000;
    if (v.includes('K')) return n * 1_000;
    return n;
}

function parseEnds(e: string): number {
    return parseInt(e.replace(/[^0-9]/g, ''), 10) || 9999;
}

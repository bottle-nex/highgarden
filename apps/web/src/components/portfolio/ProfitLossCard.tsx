'use client';
import { JSX, useState } from 'react';
import { LuArrowUpFromLine } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PROFIT_TIME_RANGES, type ProfitTimeRange } from './types';

export default function ProfitLossCard(): JSX.Element {
    const [activeRange, setActiveRange] = useState<ProfitTimeRange>('1D');

    return (
        <div className="border border-neutral-900 col-span-1 p-4 sm:p-5 bg-dark-base rounded-lg flex flex-col">
            <div className="w-full flex flex-col gap-y-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-x-2 text-white/70 text-sm">
                    <span className="size-2 rounded-full bg-white/40" />
                    <p>Profit/Loss</p>
                </div>
                <div className="flex items-center gap-x-1 border border-neutral-900 bg-dark-base p-0.5 self-start sm:self-auto rounded-md">
                    {PROFIT_TIME_RANGES.map((range) => {
                        const isActive = range === activeRange;
                        return (
                            <Button
                                key={range}
                                variant="ghost"
                                onClick={() => setActiveRange(range)}
                                className={cn(
                                    'h-auto rounded-md px-2.5 py-1 text-xs border',
                                    isActive
                                        ? 'bg-alpha/15 text-alpha border-alpha/30 hover:bg-alpha/15 hover:text-alpha'
                                        : 'border-transparent text-white/60 hover:bg-transparent hover:text-white',
                                )}
                            >
                                {range}
                            </Button>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-center justify-between mt-2 gap-x-3">
                <div className="flex items-center gap-x-2 min-w-0">
                    <span className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums">
                        $0.00
                    </span>
                    <LuArrowUpFromLine className="text-white/40 size-4 shrink-0" />
                </div>
                <div className="hidden sm:flex items-center gap-x-1 text-white/50 text-sm">
                    <span className="inline-block size-0 border-t-[6px] border-b-[6px] border-r-[10px] border-t-transparent border-b-transparent border-r-white/40" />
                    solmarket
                </div>
            </div>
            <p className="mt-1 text-xs text-white/50">Past Day</p>
            <div className="mt-auto pt-6">
                <div className="h-2 w-full bg-gradient-to-r from-alpha/0 via-alpha/40 to-alpha/0 rounded-full" />
            </div>
        </div>
    );
}

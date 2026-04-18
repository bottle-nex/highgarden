'use client';
import { JSX, useState } from 'react';
import { LuArrowUpFromLine } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PROFIT_TIME_RANGES, type ProfitTimeRange } from './types';

export default function ProfitLossCard(): JSX.Element {
    const [activeRange, setActiveRange] = useState<ProfitTimeRange>('1D');

    return (
        <div className="border border-neutral-900 col-span-1 p-5 bg-dark-alpha flex flex-col">
            <div className="w-full flex items-start justify-between">
                <div className="flex items-center gap-x-2 text-white/70">
                    <span className="size-2 rounded-full bg-white/40" />
                    <p>Profit/Loss</p>
                </div>
                <div className="flex items-center gap-x-1 border border-neutral-900 bg-dark-base p-0.5">
                    {PROFIT_TIME_RANGES.map((range) => {
                        const isActive = range === activeRange;
                        return (
                            <Button
                                key={range}
                                variant="ghost"
                                onClick={() => setActiveRange(range)}
                                className={cn(
                                    'h-auto rounded-none px-3 py-1 text-xs border',
                                    isActive
                                        ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/15 hover:text-primary'
                                        : 'border-transparent text-white/60 hover:bg-transparent hover:text-white',
                                )}
                            >
                                {range}
                            </Button>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-x-2">
                    <span className="text-4xl font-semibold">$0.00</span>
                    <LuArrowUpFromLine className="text-white/40 size-4" />
                </div>
                <div className="flex items-center gap-x-1 text-white/50 text-sm">
                    <span className="inline-block size-0 border-t-[6px] border-b-[6px] border-r-[10px] border-t-transparent border-b-transparent border-r-white/40" />
                    solmarket
                </div>
            </div>
            <p className="mt-1 text-xs text-white/50">Past Day</p>
            <div className="mt-auto pt-6">
                <div className="h-2 w-full bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 rounded-full" />
            </div>
        </div>
    );
}

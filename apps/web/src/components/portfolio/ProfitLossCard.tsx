'use client';
import { JSX, useState } from 'react';
import { LuArrowUpFromLine } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PROFIT_TIME_RANGES, type ProfitTimeRange } from './types';
import { UpcomingBadge } from './UpcomingBadge';

export default function ProfitLossCard(): JSX.Element {
    const [activeRange, setActiveRange] = useState<ProfitTimeRange>('1D');

    return (
        <div className="border border-white/8 col-span-1 p-5 sm:p-6 bg-dark-base rounded-lg flex flex-col">
            <div className="w-full flex flex-col gap-y-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-x-2 text-[11px] uppercase tracking-[0.18em] font-medium text-white/55">
                    <span className="size-1.5 rounded-full bg-white/40" />
                    Profit / Loss
                    <UpcomingBadge />
                </div>
                <div className="flex items-center gap-x-0.5 bg-white/[0.04] p-0.5 self-start sm:self-auto rounded-md">
                    {PROFIT_TIME_RANGES.map((range) => {
                        const isActive = range === activeRange;
                        return (
                            <Button
                                key={range}
                                variant="ghost"
                                onClick={() => setActiveRange(range)}
                                className={cn(
                                    'h-7 rounded-[5px] px-2.5 text-[11px] font-medium tabular-nums',
                                    isActive
                                        ? 'bg-alpha/15 text-alpha hover:bg-alpha/15 hover:text-alpha'
                                        : 'text-white/45 hover:bg-transparent hover:text-white/80',
                                )}
                            >
                                {range}
                            </Button>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-baseline gap-x-2.5 mt-5">
                <span className="text-3xl sm:text-[40px] leading-none font-semibold tracking-tight tabular-nums text-white">
                    $0.00
                </span>
                <LuArrowUpFromLine className="text-white/35 size-4" />
            </div>
            <p className="mt-1.5 text-xs text-white/45">Past Day</p>
            <div className="mt-auto pt-6">
                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <p className="mt-3 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
                    Performance chart available soon
                </p>
            </div>
        </div>
    );
}

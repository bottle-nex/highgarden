'use client';
import { JSX, ReactNode } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import { LuShare2 } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Position } from './types';
import Image from 'next/image';

export function MarketIcon({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}): JSX.Element {
    return (
        <div
            className={cn(
                'flex items-center justify-center shrink-0 border-[1.5px] border-white rounded-sm overflow-hidden',
                className,
            )}
        >
            {children}
        </div>
    );
}

export default function PositionRow({ position }: { position: Position }): JSX.Element {
    const isUp = position.side === 'Up';

    return (
        <div className="grid grid-cols-[3fr_1fr_1fr_1fr_1fr_auto] gap-x-4 items-center px-2 py-4 border-t border-neutral-900">
            <div className="flex items-center gap-x-3 min-w-0">
                <MarketIcon className="bg-yellow-500">
                    <Image src={'/images/icons/btc.webp'} alt="Bitcoin" width={40} height={40} />
                </MarketIcon>
                <div className="min-w-0">
                    <p className="text-sm text-white truncate">{position.title}</p>
                    <div className="flex items-center gap-x-2 mt-1">
                        <span
                            className={cn(
                                'text-xs px-2 py-0.5',
                                isUp ? 'bg-primary/15 text-primary' : 'bg-red-500/15 text-red-400',
                            )}
                        >
                            {position.side} {position.sideCents}¢
                        </span>
                        <span className="text-xs text-white/50">{position.shares} shares</span>
                    </div>
                </div>
            </div>
            <div className="text-sm text-white/70">
                {position.avg}¢ <span className="text-white/40">→</span> {position.now}¢
            </div>
            <div className="text-sm text-white/70">${position.traded.toFixed(2)}</div>
            <div className="text-sm text-white/70">${position.toWin.toFixed(2)}</div>
            <div>
                <div className="flex items-center gap-x-1 text-green-500 text-xs">
                    <FaCheckCircle className="size-3.5" />
                    {position.status}
                </div>
                <div className="text-green-500 text-sm font-medium">
                    ${position.value.toFixed(2)}
                </div>
            </div>
            <div className="flex items-center gap-x-2">
                <Button variant="outline" className="h-9 px-4 text-sm" onClick={() => {}}>
                    Redeem
                </Button>
                <Button
                    size="icon"
                    className="size-9 bg-neutral-800 hover:bg-neutral-900"
                    onClick={() => {}}
                >
                    <LuShare2 />
                </Button>
            </div>
        </div>
    );
}

'use client';
import { JSX } from 'react';
import { LuTicket } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { MarketIcon } from './PositionRow';
import Image from 'next/image';

export default function ClaimBanner(): JSX.Element {
    return (
        <section className="border border-neutral-900 bg-dark-alpha p-5 flex items-center justify-between">
            <div className="flex items-center gap-x-4">
                <div className="flex items-start">
                    <MarketIcon className="bg-yellow-500 relative z-10 -rotate-6">
                        <Image src="/images/icons/btc.webp" alt="Bitcoin" width={40} height={40} />
                    </MarketIcon>
                    <MarketIcon className="bg-yellow-500 relative z-0 -ml-5 -mt-1 rotate-6 ring-2 ring-dark-alpha">
                        <Image src="/images/icons/btc.webp" alt="Bitcoin" width={40} height={40} />
                    </MarketIcon>
                </div>
                <div className="ml-6 flex items-baseline gap-x-2">
                    <span className="text-white/70">You won</span>
                    <span className="text-white text-2xl font-semibold">$2.37</span>
                </div>
            </div>
            <Button className="h-10 px-6 text-sm" onClick={() => {}}>
                <LuTicket /> Claim
            </Button>
        </section>
    );
}

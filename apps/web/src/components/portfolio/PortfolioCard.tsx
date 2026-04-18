'use client';
import { JSX, useState } from 'react';
import { ImUserTie } from 'react-icons/im';
import { LuArrowDownToLine, LuArrowUpFromLine, LuEye, LuEyeOff } from 'react-icons/lu';
import { Button } from '@/components/ui/button';

export default function PortfolioCard(): JSX.Element {
    const [hidden, setHidden] = useState<boolean>(false);
    return (
        <div className="border border-neutral-900 col-span-1 p-5 bg-dark-alpha">
            <div className="w-full flex items-start justify-between">
                <div className="flex items-center gap-x-2 text-white/70">
                    <p>Portfolio</p>
                    <ImUserTie className="text-white" />
                </div>
                <div className="text-white/70 text-right">
                    <p className="text-xs">Available to trade</p>
                    <p className="text-2xl font-semibold text-white">{hidden ? '••••' : '$1.10'}</p>
                </div>
            </div>
            <div className="flex items-center gap-x-2 mt-1">
                <span className="text-4xl font-semibold">{hidden ? '••••' : '$3,567.23'}</span>
                <button
                    type="button"
                    onClick={() => setHidden((prev) => !prev)}
                    className="text-white/40 hover:text-white/70 cursor-pointer"
                    aria-label={hidden ? 'Show balance' : 'Hide balance'}
                >
                    {hidden ? <LuEye /> : <LuEyeOff />}
                </button>
            </div>
            <p className="mt-1 text-xs text-primary">
                {hidden ? '•••• past day' : '+$0.23 (6.64%) past day'}
            </p>
            <div className="w-full grid gap-x-4 mt-5 grid-cols-2">
                <Button
                    className="col-span-1 w-full h-10 text-sm"
                    onClick={() => console.log('deposit clicked')}
                >
                    <LuArrowDownToLine /> Deposit
                </Button>
                <Button
                    className="col-span-1 w-full h-10 text-sm"
                    variant="outline"
                    onClick={() => console.log('withdraw clicked')}
                >
                    <LuArrowUpFromLine /> Withdraw
                </Button>
            </div>
        </div>
    );
}

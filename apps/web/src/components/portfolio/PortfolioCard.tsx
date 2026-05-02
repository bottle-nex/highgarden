'use client';
import { JSX, useState } from 'react';
import { ImUserTie } from 'react-icons/im';
import { LuArrowDownToLine, LuArrowUpFromLine, LuEye, LuEyeOff } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { useDepositDialogStore } from '@/store/ui/useDepositDialogStore';

export default function PortfolioCard(): JSX.Element {
    const [hidden, setHidden] = useState<boolean>(false);
    const open_deposit_dialog = useDepositDialogStore((s) => s.setOpen);
    return (
        <div className="border border-neutral-900 col-span-1 p-5 bg-dark-faded rounded-lg">
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
            <div className="w-full grid gap-x-3 mt-5 grid-cols-2">
                <Button
                    onClick={() => open_deposit_dialog(true)}
                    className="col-span-1 w-full h-10 rounded-full text-sm font-medium tracking-tight bg-dark-base/85 text-neutral-200 hover:text-white hover:bg-dark-base border border-white/6 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all duration-200"
                >
                    <LuArrowDownToLine /> Deposit
                </Button>
                <Button
                    variant="outline"
                    onClick={() => {}}
                    className="col-span-1 w-full h-10 rounded-full text-sm font-medium tracking-tight border-white/6 text-neutral-300 hover:text-white hover:bg-dark-base/60 transition-all duration-200"
                >
                    <LuArrowUpFromLine /> Withdraw
                </Button>
            </div>
        </div>
    );
}

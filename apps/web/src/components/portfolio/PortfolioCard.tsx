'use client';
import { JSX, useState } from 'react';
import { ImUserTie } from 'react-icons/im';
import { LuArrowDownToLine, LuArrowUpFromLine, LuEye, LuEyeOff } from 'react-icons/lu';
import { useDepositDialogStore } from '@/store/ui/useDepositDialogStore';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { selectAllPositions, usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { CroppedButton } from '../ui/cropped-button';

const usd_fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export default function PortfolioCard(): JSX.Element {
    const [hidden, setHidden] = useState<boolean>(false);
    const open_deposit_dialog = useDepositDialogStore((s) => s.setOpen);
    const wallet = useWalletBalance({ enabled: true });
    const positions = usePositionsStore(selectAllPositions);

    const cash_usd = wallet.data?.usdcBalance.uiAmount ?? 0;
    const positions_usd = positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const total_usd = cash_usd + positions_usd;

    return (
        <div className="border border-neutral-900 col-span-1 p-5 bg-dark-base rounded-lg">
            <div className="w-full flex items-start justify-between">
                <div className="flex items-center gap-x-2 text-white/70">
                    <p>Portfolio</p>
                    <ImUserTie className="text-white" />
                </div>
                <div className="text-white/70 text-right">
                    <p className="text-xs">Available to trade</p>
                    <p className="text-2xl font-semibold text-white">
                        {hidden ? '••••' : usd_fmt.format(cash_usd)}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-x-2 mt-1">
                <span className="text-4xl font-semibold">
                    {hidden ? '••••' : usd_fmt.format(total_usd)}
                </span>
                <button
                    type="button"
                    onClick={() => setHidden((prev) => !prev)}
                    className="text-white/40 hover:text-white/70 cursor-pointer"
                    aria-label={hidden ? 'Show balance' : 'Hide balance'}
                >
                    {hidden ? <LuEye /> : <LuEyeOff />}
                </button>
            </div>
            <p className="mt-1 text-xs text-white/50">
                {hidden ? '••••' : `${usd_fmt.format(positions_usd)} in open positions`}
            </p>
            <div className="w-full grid gap-x-3 mt-5 grid-cols-2">
                <CroppedButton
                    onClick={() => open_deposit_dialog(true)}
                    className="col-span-1 w-full h-10 text-sm font-medium tracking-tight bg-dark-faded text-light-alpha hover:text-white border border-white/6 transition-all duration-200"
                >
                    <LuArrowDownToLine /> Deposit
                </CroppedButton>
                <CroppedButton
                    onClick={() => {}}
                    className="col-span-1 w-full h-10 text-sm font-medium tracking-tight bg-white hover:bg-neutral-100 text-dark-alpha border border-white/6 transition-all duration-200"
                >
                    <LuArrowUpFromLine /> Withdraw
                </CroppedButton>
            </div>
        </div>
    );
}

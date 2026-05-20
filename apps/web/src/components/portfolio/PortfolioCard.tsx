'use client';
import { JSX, useState } from 'react';
import { ImUserTie } from 'react-icons/im';
import { LuArrowDownToLine, LuArrowUpFromLine, LuEye, LuEyeOff } from 'react-icons/lu';
import { useDepositDialogStore } from '@/store/ui/useDepositDialogStore';
import { useWithdrawDialogStore } from '@/store/ui/useWithdrawDialogStore';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { selectAllPositions, usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { Button } from '@/components/ui/button';

const usd_fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export default function PortfolioCard(): JSX.Element {
    const [hidden, setHidden] = useState<boolean>(false);
    const open_deposit_dialog = useDepositDialogStore((s) => s.setOpen);
    const open_withdraw_dialog = useWithdrawDialogStore((s) => s.setOpen);
    const wallet = useWalletBalance({ enabled: true });
    const positions = usePositionsStore(selectAllPositions);

    const cash_usd = wallet.data?.usdcBalance.uiAmount ?? 0;
    const positions_usd = positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const total_usd = cash_usd + positions_usd;

    return (
        <div className="border border-white/8 col-span-1 p-5 sm:p-6 bg-dark-base rounded-lg">
            <div className="w-full flex items-start justify-between gap-x-4">
                <div className="flex items-center gap-x-2 text-[11px] uppercase tracking-[0.18em] font-medium text-white/55">
                    <ImUserTie className="size-3.5 text-white/75" />
                    Portfolio
                </div>
                <div className="text-right min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-medium">
                        Available to trade
                    </p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-white/90 tabular-nums truncate">
                        {hidden ? '••••' : usd_fmt.format(cash_usd)}
                    </p>
                </div>
            </div>
            <div className="flex items-baseline gap-x-2.5 mt-5">
                <span className="text-3xl sm:text-[40px] leading-none font-semibold tracking-tight tabular-nums text-white">
                    {hidden ? '••••' : usd_fmt.format(total_usd)}
                </span>
                <button
                    type="button"
                    onClick={() => setHidden((prev) => !prev)}
                    className="text-white/35 hover:text-white/70 transition-colors cursor-pointer"
                    aria-label={hidden ? 'Show balance' : 'Hide balance'}
                >
                    {hidden ? <LuEye className="size-4" /> : <LuEyeOff className="size-4" />}
                </button>
            </div>
            <p className="mt-1.5 text-xs text-white/45 tabular-nums">
                {hidden ? '••••' : `${usd_fmt.format(positions_usd)} in open positions`}
            </p>
            <div className="w-full grid gap-x-2.5 mt-6 grid-cols-2">
                <Button
                    onClick={() => open_deposit_dialog(true)}
                    className="h-11 rounded-lg gap-x-2 text-sm font-medium bg-white/8 hover:bg-white/12 text-white border border-white/8 transition-colors"
                >
                    <LuArrowDownToLine className="size-4" /> Deposit
                </Button>
                <Button
                    onClick={() => open_withdraw_dialog(true)}
                    className="h-11 rounded-lg gap-x-2 text-sm font-medium bg-white text-dark-alpha hover:bg-neutral-100 transition-colors"
                >
                    <LuArrowUpFromLine className="size-4" /> Withdraw
                </Button>
            </div>
        </div>
    );
}

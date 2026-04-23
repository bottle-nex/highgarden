'use client';
import { JSX, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RxCross2, RxChevronDown } from 'react-icons/rx';
import { SiSolana } from 'react-icons/si';
import { HugeiconsIcon } from '@hugeicons/react';
import { InformationCircleIcon, Copy01Icon, DollarCircleIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import OpacityBackground from './opacity-background';
import UtilityCard from './utility-card';

const DEPOSIT_ADDRESS = 'EdmX1qiDE2i624pdxs84d9vcbjp6uqwotmnFqW38ULNQ';
const MOCK_BALANCE = '$1.10';

interface DepositDialogProps {
    onClose: () => void;
}

export default function DepositDialog({ onClose }: DepositDialogProps): JSX.Element {
    const [priceImpactOpen, setPriceImpactOpen] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(DEPOSIT_ADDRESS);
            toast.success('Address copied');
        } catch {
            toast.error('Failed to copy');
        }
    };

    return (
        <OpacityBackground
            className="bg-white/5 backdrop-blur-2xl"
            onBackgroundClick={() => {}}
            escapeClosing
        >
            <UtilityCard className="max-w-md w-full rounded-lg px-6 py-5">
                <div className="relative flex flex-col items-center pb-4">
                    <h2 className="text-lg font-semibold">Transfer Crypto</h2>
                    <p className="text-sm text-light-alpha/50">
                        Polymarket Balance: {MOCK_BALANCE}
                    </p>
                    <button
                        type="button"
                        title="Close"
                        onClick={onClose}
                        className="absolute top-0 right-0 cursor-pointer text-light-alpha/70 hover:text-light-alpha"
                    >
                        <RxCross2 className="size-5" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                        <p className="text-sm font-semibold mb-2">Supported token</p>
                        <button
                            type="button"
                            className="w-full flex items-center justify-between gap-2 bg-dark-base border border-dark-faded rounded-md px-3 py-2.5 cursor-pointer hover:bg-dark-faded/50 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <span className="size-5 rounded-full bg-[#2775ca] flex items-center justify-center">
                                    <HugeiconsIcon
                                        icon={DollarCircleIcon}
                                        className="size-4 text-white"
                                        strokeWidth={2}
                                    />
                                </span>
                                <span className="text-sm font-medium">USDC</span>
                            </span>
                            <RxChevronDown className="size-4 text-light-alpha/60" />
                        </button>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold">Supported chain</p>
                            <span className="flex items-center gap-1 text-xs text-light-alpha/50">
                                Min $3
                                <HugeiconsIcon
                                    icon={InformationCircleIcon}
                                    className="size-3.5"
                                    strokeWidth={2}
                                />
                            </span>
                        </div>
                        <button
                            type="button"
                            className="w-full flex items-center justify-between gap-2 bg-dark-base border border-dark-faded rounded-md px-3 py-2.5 cursor-pointer hover:bg-dark-faded/50 transition-colors"
                        >
                            <span className="flex items-center gap-2">
                                <SiSolana className="size-5 text-[#9945ff]" />
                                <span className="text-sm font-medium">Solana</span>
                            </span>
                            <RxChevronDown className="size-4 text-light-alpha/60" />
                        </button>
                    </div>
                </div>

                <div className="flex justify-center py-6">
                    <div className="relative rounded-lg border border-dark-faded p-3 bg-dark-alpha">
                        <QRCodeSVG
                            value={DEPOSIT_ADDRESS}
                            size={200}
                            level="M"
                            bgColor="#0a0a0a"
                            fgColor="#ffffff"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="size-9 rounded-full bg-dark-alpha flex items-center justify-center border-2 border-dark-faded">
                                <SiSolana className="size-5 text-[#9945ff]" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-wider text-light-alpha/50 font-medium">
                            Deposit address
                        </p>
                        <HugeiconsIcon
                            icon={InformationCircleIcon}
                            className="size-3.5 text-light-alpha/40"
                            strokeWidth={2}
                        />
                    </div>
                    <button
                        type="button"
                        className="text-xs text-light-alpha/50 hover:text-light-alpha/80 cursor-pointer transition-colors"
                    >
                        Terms apply
                    </button>
                </div>

                <div className="group flex items-center gap-2 bg-dark-base border border-dark-faded rounded-md pl-3 pr-1.5 py-1.5 hover:border-light-alpha/20 transition-colors">
                    <span className="flex-1 text-sm font-mono text-light-alpha/90 truncate">
                        {DEPOSIT_ADDRESS}
                    </span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        aria-label="Copy address"
                        className="shrink-0 flex items-center gap-1.5 rounded bg-dark-faded/60 hover:bg-dark-faded px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors"
                    >
                        <HugeiconsIcon icon={Copy01Icon} className="size-3.5" strokeWidth={2} />
                        Copy
                    </button>
                </div>

                <div className="mt-4 border-t border-dark-faded/60 pt-3">
                    <button
                        type="button"
                        onClick={() => setPriceImpactOpen((v) => !v)}
                        className="w-full flex items-center justify-between text-sm cursor-pointer group"
                    >
                        <span className="flex items-center gap-2 text-light-alpha/60 group-hover:text-light-alpha/80 transition-colors">
                            <span>Price impact</span>
                            <HugeiconsIcon
                                icon={InformationCircleIcon}
                                className="size-3.5 text-light-alpha/40"
                                strokeWidth={2}
                            />
                        </span>
                        <span className="flex items-center gap-1 text-light-alpha">
                            <span className="font-medium tabular-nums">0.00%</span>
                            <RxChevronDown
                                className={`size-4 text-light-alpha/50 transition-transform ${priceImpactOpen ? 'rotate-180' : ''}`}
                            />
                        </span>
                    </button>
                    {priceImpactOpen && (
                        <p className="mt-2 text-xs text-light-alpha/50 leading-relaxed">
                            No price impact for deposits on the same chain.
                        </p>
                    )}
                </div>
            </UtilityCard>
        </OpacityBackground>
    );
}

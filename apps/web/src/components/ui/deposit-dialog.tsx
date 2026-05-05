'use client';
import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCode } from 'react-qrcode-logo';
import { PiX, PiCopy, PiInfo, PiArrowClockwise, PiCheckCircle } from 'react-icons/pi';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import OpacityBackground from './opacity-background';
import UtilityCard from './utility-card';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { Input } from './input';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useExternalWalletUsdc } from '@/hooks/useExternalWalletUsdc';
import { useDepositFromWallet } from '@/hooks/useDepositFromWallet';
import { useWallet } from '@solana/wallet-adapter-react';
import ConnectWalletButton from '@/components/wallet/ConnectWalletButton';
import { PiSignOut, PiWallet } from 'react-icons/pi';
import { cn } from '@/lib/utils';

type Mode = 'wallet' | 'address';

interface DepositDialogProps {
    onClose: () => void;
}

interface DialogHeaderProps {
    balance_text: string;
    onClose: () => void;
}

interface ModeToggleProps {
    mode: Mode;
    on_change: (next: Mode) => void;
}

interface SendFromWalletPanelProps {
    recipient: string;
    on_deposit_success: () => void;
}

interface ConnectedWalletRowProps {
    wallet_balance: number | null;
    balance_loading: boolean;
}

interface AmountInputProps {
    value: string;
    on_change: (next: string) => void;
    on_max: () => void;
    max_disabled: boolean;
}

interface PresetChipsProps {
    disabled: boolean;
    on_pick: (amount: number) => void;
}

interface StatusLineProps {
    insufficient: boolean;
    error: string | null;
    success_signature: string | null;
}

interface ReceiveAddressPanelProps {
    address: string;
    loading: boolean;
    error: string | null;
    on_retry: () => void;
}

interface NetworkWarningProps {
    network_label: string;
}

const usd_fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function shorten_address(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

export default function DepositDialog({ onClose }: DepositDialogProps): JSX.Element {
    const [mode, set_mode] = useState<Mode>('wallet');
    const wallet = useWalletBalance({ enabled: true });

    const measure_ref = useRef<HTMLDivElement>(null);
    const [content_height, set_content_height] = useState<number | 'auto'>('auto');

    useLayoutEffect(() => {
        const node = measure_ref.current;
        if (!node) return;
        set_content_height(node.scrollHeight);
        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect.height;
            if (typeof next === 'number') set_content_height(next);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const address = wallet.data?.publicKey ?? '';
    const network_label = wallet.data?.network ?? 'Solana';
    const balance_text = usd_fmt.format(wallet.data?.usdcBalance.uiAmount ?? 0);

    return (
        <OpacityBackground
            className="bg-white/5 backdrop-blur-2xl"
            onBackgroundClick={onClose}
            escapeClosing
        >
            <UtilityCard className="max-w-md w-full rounded-lg px-6 py-5">
                <TooltipProvider delay={150}>
                    <DialogHeader balance_text={balance_text} onClose={onClose} />

                    <ModeToggle mode={mode} on_change={set_mode} />

                    <motion.div
                        animate={{ height: content_height }}
                        transition={{ duration: 0.35, ease: [0.32, 0.72, 0.24, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div ref={measure_ref}>
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={mode}
                                    initial={{ opacity: 0, filter: 'blur(6px)' }}
                                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, filter: 'blur(6px)' }}
                                    transition={{
                                        duration: 0.18,
                                        ease: [0.25, 0.46, 0.45, 0.94],
                                    }}
                                >
                                    {mode === 'wallet' ? (
                                        <SendFromWalletPanel
                                            recipient={address}
                                            on_deposit_success={() => void wallet.refetch()}
                                        />
                                    ) : (
                                        <ReceiveAddressPanel
                                            address={address}
                                            loading={wallet.loading}
                                            error={wallet.error}
                                            on_retry={() => void wallet.refetch()}
                                        />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* <FeatureBullets /> */}
                    <NetworkWarning network_label={network_label} />
                </TooltipProvider>
            </UtilityCard>
        </OpacityBackground>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────────────

function DialogHeader({ balance_text, onClose }: DialogHeaderProps) {
    return (
        <div className="relative flex flex-col items-center pb-4 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
                Deposit{' '}
                <Tooltip>
                    <TooltipTrigger
                        render={(props) => (
                            <span
                                {...props}
                                className="underline decoration-dotted underline-offset-4 cursor-help"
                            >
                                USDC
                            </span>
                        )}
                    />
                    <TooltipContent>
                        USD Coin, a stablecoin pegged 1:1 to the US dollar
                    </TooltipContent>
                </Tooltip>
            </h2>
            <p className="mt-1 text-sm text-light-alpha/55">Add USDC funds to start trading</p>
            <p className="mt-2 text-[11px] uppercase tracking-wider text-light-alpha/40">
                Available · <span className="text-light-alpha/70 tabular-nums">{balance_text}</span>
            </p>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={onClose}
                className="absolute top-0 right-0 text-light-alpha/60 hover:text-light-alpha rounded-full"
            >
                <PiX />
            </Button>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Mode toggle
// ────────────────────────────────────────────────────────────────────────────

function ModeToggle({ mode, on_change }: ModeToggleProps) {
    const options: Array<{ value: Mode; label: string }> = [
        { value: 'wallet', label: 'Send from wallet' },
        { value: 'address', label: 'Receive to address' },
    ];
    return (
        <div className="flex p-1 rounded-full bg-dark-base/60 border border-dark-faded/30 mb-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => on_change(o.value)}
                    className={cn(
                        'relative flex-1 rounded-full text-sm font-medium py-3 transition-colors cursor-pointer',
                        mode === o.value
                            ? 'text-light-alpha'
                            : 'text-light-alpha/50 hover:text-light-alpha/80',
                    )}
                >
                    {mode === o.value && (
                        <motion.span
                            layoutId="deposit-mode-pill"
                            className="absolute inset-0 rounded-full bg-dark-alpha border border-white/3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01),0_1px_3px_rgba(0,0,0,0.05)]"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                        />
                    )}
                    <span className="relative z-10">{o.label}</span>
                </button>
            ))}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Send-from-wallet panel
// ────────────────────────────────────────────────────────────────────────────

function SendFromWalletPanel({ recipient, on_deposit_success }: SendFromWalletPanelProps) {
    const { publicKey } = useWallet();
    const {
        ui_amount: wallet_balance,
        loading: balance_loading,
        refetch: refetch_balance,
    } = useExternalWalletUsdc();
    const { phase, error, last_signature, deposit, reset } = useDepositFromWallet();
    const [amount_input, set_amount_input] = useState('');

    const has_wallet = Boolean(publicKey);
    const balance_known = wallet_balance !== null && !balance_loading;
    const max = wallet_balance ?? 0;
    const parsed = parse_amount(amount_input);
    // Only flag insufficient once we actually know the balance — otherwise a slow
    // RPC tick falsely rejects valid amounts the moment the user types.
    const insufficient = balance_known && parsed !== null && parsed > max;
    const in_flight =
        phase === 'awaiting-signature' || phase === 'sending' || phase === 'confirming';
    const can_submit = has_wallet && parsed !== null && parsed > 0 && !insufficient && !in_flight;

    useEffect(() => {
        if (phase === 'success') {
            toast.success('Deposit confirmed');
            void refetch_balance();
            on_deposit_success();
        }
    }, [phase, refetch_balance, on_deposit_success]);

    if (!has_wallet) {
        return (
            <div className="rounded-lg border border-dark-faded/60 bg-dark-base/40 px-5 py-6 flex flex-col items-center gap-4">
                <div className="size-11 rounded-full bg-dark-faded flex items-center justify-center">
                    <PiWallet className="size-5 text-light-alpha/70" />
                </div>
                <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-light-alpha/90">
                        Connect your Solana wallet
                    </p>
                    <p className="text-xs text-light-alpha/55">
                        Send USDC in one click — no copy-paste needed
                    </p>
                </div>
                <ConnectWalletButton className="w-full text-sm font-[550] tracking-wide h-11 rounded-full bg-[#0394fc] text-white border border-white/6 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.05)]" />
            </div>
        );
    }

    const submit_label = (() => {
        switch (phase) {
            case 'building':
            case 'simulating':
                return 'Preparing…';
            case 'awaiting-signature':
                return 'Confirm in wallet…';
            case 'sending':
            case 'confirming':
                return 'Confirming on-chain…';
            case 'success':
                return 'Deposit again';
            default:
                return parsed && !insufficient ? `Deposit ${usd_fmt.format(parsed)}` : 'Deposit';
        }
    })();

    return (
        <div className="space-y-3">
            <ConnectedWalletRow wallet_balance={wallet_balance} balance_loading={balance_loading} />

            <AmountInput
                value={amount_input}
                on_change={(v) => {
                    if (phase === 'success' || phase === 'error') reset();
                    set_amount_input(v);
                }}
                on_max={() => set_amount_input(max > 0 ? String(max) : '')}
                max_disabled={max <= 0}
            />

            <PresetChips
                disabled={max <= 0}
                on_pick={(amt) => {
                    if (phase === 'success' || phase === 'error') reset();
                    set_amount_input(String(amt));
                }}
            />

            <StatusLine
                insufficient={insufficient}
                error={error}
                success_signature={phase === 'success' ? last_signature : null}
            />

            <Button
                type="button"
                disabled={!can_submit}
                onClick={() => {
                    if (phase === 'success') {
                        reset();
                        set_amount_input('');
                        return;
                    }
                    if (parsed !== null) void deposit({ recipient, ui_amount: parsed });
                }}
                className="w-full h-12 rounded-full text-[15px] font-semibold tracking-wide text-white hover:text-white border border-white/6 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.05)] disabled:cursor-not-allowed transition-all duration-200 bg-[#0394fc] hover:bg-[#21a3ff]"
            >
                {submit_label}
            </Button>
        </div>
    );
}

// ── helpers for SendFromWalletPanel ──────────────────────────────────────────

function ConnectedWalletRow({ wallet_balance, balance_loading }: ConnectedWalletRowProps) {
    const { wallet, publicKey, disconnect } = useWallet();
    const wallet_name = wallet?.adapter.name ?? 'Wallet';
    const wallet_icon = wallet?.adapter.icon;
    const address = publicKey?.toBase58() ?? '';

    return (
        <div className="flex items-center justify-between rounded-xl border border-dark-faded/60 bg-dark-base px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-8 rounded-full bg-dark-faded flex items-center justify-center shrink-0 overflow-hidden">
                    {wallet_icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={wallet_icon} alt={wallet_name} className="size-5" />
                    ) : (
                        <PiWallet className="size-4 text-light-alpha/70" />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-light-alpha/40 leading-tight">
                        {wallet_name}
                    </div>
                    <div className="text-sm font-mono text-light-alpha/90 leading-tight truncate">
                        {shorten_address(address)}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-light-alpha/40 leading-tight">
                        Balance
                    </div>
                    <div className="text-sm font-medium tabular-nums text-light-alpha/90 leading-tight">
                        {balance_loading ? '…' : `${(wallet_balance ?? 0).toFixed(2)} USDC`}
                    </div>
                </div>
                <Tooltip>
                    <TooltipTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Disconnect wallet"
                                onClick={() => void disconnect()}
                                className="text-light-alpha/40 hover:text-light-alpha/80"
                            >
                                <PiSignOut />
                            </Button>
                        )}
                    />
                    <TooltipContent>Disconnect</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}

function AmountInput({ value, on_change, on_max, max_disabled }: AmountInputProps) {
    return (
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-light text-light-alpha/40 pointer-events-none">
                $
            </span>
            <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={value}
                onChange={(e) => on_change(e.target.value)}
                className="h-20 pl-9 pr-20 rounded-lg bg-dark-base border-dark-faded text-2xl! font-semibold tabular-nums tracking-tight focus-visible:border-light-alpha/30"
            />
            <Button
                type="button"
                variant="ghost"
                onClick={on_max}
                disabled={max_disabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-full text-[11px] uppercase tracking-wider font-semibold text-light-alpha/60 hover:text-light-alpha bg-dark-faded/60 hover:bg-dark-faded"
            >
                Max
            </Button>
        </div>
    );
}

const PRESETS = [10, 50, 100] as const;

function PresetChips({ disabled, on_pick }: PresetChipsProps) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((amt) => (
                <Button
                    key={amt}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => on_pick(amt)}
                    className="h-9 rounded-full text-xs font-medium border-dark-faded/80 text-light-alpha/70 hover:text-light-alpha hover:bg-dark-base bg-dark-base/20"
                >
                    ${amt}
                </Button>
            ))}
        </div>
    );
}

function StatusLine({ insufficient, error, success_signature }: StatusLineProps) {
    if (!insufficient && !error && !success_signature) return null;
    return (
        <div className="px-1 text-xs">
            {insufficient && <p className="text-destructive">Amount exceeds your wallet balance</p>}
            {error && <p className="text-destructive">{error}</p>}
            {success_signature && (
                <p className="flex items-center gap-1.5 text-emerald-400">
                    <PiCheckCircle className="size-3.5" />
                    Deposited ·{' '}
                    <span className="font-mono">{shorten_address(success_signature)}</span>
                </p>
            )}
        </div>
    );
}

function parse_amount(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

// ────────────────────────────────────────────────────────────────────────────
// Receive-to-address panel (QR + copy)
// ────────────────────────────────────────────────────────────────────────────

function ReceiveAddressPanel({ address, loading, error, on_retry }: ReceiveAddressPanelProps) {
    const handle_copy = async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            toast.success('Address copied');
        } catch {
            toast.error('Failed to copy');
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex justify-center">
                <div className="rounded-lg border border-dark-faded p-4 bg-dark-base">
                    {address ? (
                        <QRCode
                            value={address}
                            size={192}
                            ecLevel="H"
                            quietZone={0}
                            bgColor="#101519"
                            fgColor="#ffffff"
                            qrStyle="dots"
                            eyeRadius={0}
                            logoImage="/images/icons/solana.png"
                            logoWidth={36}
                            logoHeight={36}
                            logoPadding={4}
                            logoPaddingStyle="circle"
                            removeQrCodeBehindLogo
                        />
                    ) : (
                        <div className="size-48 flex items-center justify-center text-xs text-light-alpha/40">
                            {error ? 'Unable to load address' : 'Loading…'}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-light-alpha/50 font-medium">
                    Your deposit address
                </p>
                {error && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={on_retry}
                        className="text-light-alpha/60 hover:text-light-alpha"
                    >
                        <PiArrowClockwise /> Retry
                    </Button>
                )}
            </div>

            <div className="flex items-center gap-2 bg-dark-base border border-dark-faded rounded-md pl-3 pr-1.5 py-1.5 hover:border-light-alpha/20 transition-colors">
                {address ? (
                    <Tooltip>
                        <TooltipTrigger
                            render={(props) => (
                                <span
                                    {...props}
                                    className="flex-1 font-mono text-sm text-light-alpha/90 truncate cursor-help"
                                >
                                    {shorten_address(address)}
                                </span>
                            )}
                        />
                        <TooltipContent className="max-w-sm break-all font-mono">
                            {address}
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <span className="flex-1 font-mono text-sm text-light-alpha/40 truncate">
                        {loading ? 'Loading…' : ''}
                    </span>
                )}
                <Tooltip>
                    <TooltipTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={handle_copy}
                                disabled={!address}
                                aria-label="Copy address"
                                className="text-light-alpha/60 hover:text-light-alpha"
                            >
                                <PiCopy />
                            </Button>
                        )}
                    />
                    <TooltipContent>Copy address</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Reassurance + warning footers
// ────────────────────────────────────────────────────────────────────────────

// function FeatureBullets() {
//     return (
//         <ul className="mt-4 space-y-1.5 px-1 text-xs text-light-alpha/55">
//             <li className="flex items-center gap-2">
//                 <PiArrowClockwise className="size-3.5 text-light-alpha/40 shrink-0" />
//                 Withdraw your funds anytime, no lock-ups
//             </li>
//             <li className="flex items-center gap-2">
//                 <PiLightning className="size-3.5 text-light-alpha/40 shrink-0" />
//                 Deposits arrive in seconds on Solana
//             </li>
//             <li className="flex items-center gap-2">
//                 <PiShieldCheck className="size-3.5 text-light-alpha/40 shrink-0" />
//                 Your address is yours alone, never shared or reused
//             </li>
//         </ul>
//     );
// }

function NetworkWarning({ network_label }: NetworkWarningProps) {
    return (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-dark-faded/60 bg-dark-base px-3 py-2.5">
            <PiInfo className="size-4 mt-0.5 shrink-0 text-light-alpha/50" />
            <p className="text-[10.5px] leading-relaxed text-light-alpha/60">
                Send USDC on{' '}
                <Tooltip>
                    <TooltipTrigger
                        render={(props) => (
                            <span
                                {...props}
                                className="text-light-alpha/90 font-medium underline decoration-dotted underline-offset-2 cursor-help"
                            >
                                {network_label}
                            </span>
                        )}
                    />
                    <TooltipContent>
                        Solana&apos;s primary network. Real funds — not a testnet.
                    </TooltipContent>
                </Tooltip>{' '}
                only. Other tokens or networks will be lost.
            </p>
        </div>
    );
}

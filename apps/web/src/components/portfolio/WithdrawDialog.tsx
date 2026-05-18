'use client';
import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PiX, PiInfo, PiCheckCircle, PiClipboardText } from 'react-icons/pi';
import { toast } from 'sonner';
import { PublicKey } from '@solana/web3.js';
import { motion } from 'motion/react';
import OpacityBackground from '@/components/ui/opacity-background';
import UtilityCard from '@/components/ui/utility-card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useWithdrawToWallet } from '@/hooks/useWithdrawToWallet';
import { cn } from '@/lib/utils';

const SOLSCAN_BASE = 'https://solscan.io/tx/';

const usd_fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

function shorten(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

function parse_amount(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function is_valid_solana_address(addr: string): boolean {
    if (!addr || addr.length < 32 || addr.length > 44) return false;
    try {
        new PublicKey(addr);
        return true;
    } catch {
        return false;
    }
}

interface WithdrawDialogProps {
    onClose: () => void;
}

export default function WithdrawDialog({ onClose }: WithdrawDialogProps): JSX.Element {
    const wallet = useWalletBalance({ enabled: true });
    const { phase, error, last_signature, withdraw, reset } = useWithdrawToWallet();

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

    const [destination, set_destination] = useState('');
    const [amount_input, set_amount_input] = useState('');
    // Captured at submit time so the success toast can echo the exact amount
    // the user just sent, even after the input is cleared on "Withdraw again".
    const [last_amount_sent, set_last_amount_sent] = useState<number | null>(null);
    const [last_destination_sent, set_last_destination_sent] = useState<string | null>(null);

    const network_label = wallet.data?.network ?? 'Solana';
    const balance = wallet.data?.usdcBalance.uiAmount ?? 0;
    const balance_text = usd_fmt.format(balance);
    const custodial_pk = wallet.data?.publicKey ?? '';

    const trimmed_dest = destination.trim();
    const destination_invalid = trimmed_dest.length > 0 && !is_valid_solana_address(trimmed_dest);
    const is_self_send =
        trimmed_dest.length > 0 &&
        custodial_pk.length > 0 &&
        trimmed_dest === custodial_pk;

    const parsed_amount = parse_amount(amount_input);
    const insufficient = parsed_amount !== null && parsed_amount > balance;

    const in_flight = phase === 'submitting';
    const can_submit =
        is_valid_solana_address(trimmed_dest) &&
        !is_self_send &&
        parsed_amount !== null &&
        parsed_amount > 0 &&
        !insufficient &&
        !in_flight;

    const wallet_refetch = wallet.refetch;

    useEffect(() => {
        if (phase === 'success' && last_signature) {
            const amount_text =
                last_amount_sent !== null ? usd_fmt.format(last_amount_sent) : 'USDC';
            const dest_text = last_destination_sent ? shorten(last_destination_sent) : '';
            toast.success(`Sent ${amount_text}`, {
                description: dest_text
                    ? `To ${dest_text} · Tx ${shorten(last_signature)}`
                    : `Tx ${shorten(last_signature)}`,
            });
            void wallet_refetch();
        }
    }, [phase, last_signature, last_amount_sent, last_destination_sent, wallet_refetch]);

    useEffect(() => {
        if (phase === 'error' && error) {
            toast.error('Withdrawal failed', { description: error });
        }
    }, [phase, error]);

    const submit_label = (() => {
        switch (phase) {
            case 'submitting':
                return 'Sending…';
            case 'success':
                return 'Withdraw again';
            default:
                return parsed_amount && !insufficient
                    ? `Withdraw ${usd_fmt.format(parsed_amount)}`
                    : 'Withdraw';
        }
    })();

    const handle_paste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            set_destination(text.trim());
        } catch {
            toast.error('Could not access clipboard');
        }
    };

    const handle_submit = () => {
        if (phase === 'success') {
            reset();
            set_destination('');
            set_amount_input('');
            return;
        }
        if (parsed_amount !== null && is_valid_solana_address(trimmed_dest)) {
            set_last_amount_sent(parsed_amount);
            set_last_destination_sent(trimmed_dest);
            void withdraw({ destination: trimmed_dest, ui_amount: parsed_amount });
        }
    };

    return (
        <OpacityBackground
            className="bg-white/5 backdrop-blur-2xl"
            onBackgroundClick={onClose}
            escapeClosing
        >
            <UtilityCard className="max-w-md w-full rounded-lg px-6 py-5">
                <TooltipProvider delay={150}>
                    <DialogHeader balance_text={balance_text} onClose={onClose} />

                    <motion.div
                        animate={{ height: content_height }}
                        transition={{ duration: 0.35, ease: [0.32, 0.72, 0.24, 1] }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div ref={measure_ref}>
                            <div className="space-y-3">
                                <DestinationInput
                                    value={destination}
                                    on_change={(v) => {
                                        if (phase === 'success' || phase === 'error') reset();
                                        set_destination(v);
                                    }}
                                    on_paste={handle_paste}
                                    invalid={destination_invalid}
                                    self_send={is_self_send}
                                />

                                <AmountInput
                                    value={amount_input}
                                    on_change={(v) => {
                                        if (phase === 'success' || phase === 'error') reset();
                                        set_amount_input(v);
                                    }}
                                    on_max={() =>
                                        set_amount_input(balance > 0 ? String(balance) : '')
                                    }
                                    max_disabled={balance <= 0}
                                />

                                <PresetChips
                                    disabled={balance <= 0}
                                    on_pick={(amt) => {
                                        if (phase === 'success' || phase === 'error') reset();
                                        set_amount_input(String(amt));
                                    }}
                                />

                                <StatusLine
                                    insufficient={insufficient}
                                    error={error}
                                    success_signature={
                                        phase === 'success' ? last_signature : null
                                    }
                                />

                                <Button
                                    type="button"
                                    disabled={!can_submit && phase !== 'success'}
                                    onClick={handle_submit}
                                    className="w-full h-12 rounded-full text-[15px] font-semibold tracking-wide text-white hover:text-white border border-white/6 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.55),inset_0_1px_0_0_rgba(255,255,255,0.05)] disabled:cursor-not-allowed transition-all duration-200 bg-[#0394fc] hover:bg-[#21a3ff]"
                                >
                                    {submit_label}
                                </Button>
                            </div>
                        </div>
                    </motion.div>

                    <NetworkWarning network_label={network_label} />
                </TooltipProvider>
            </UtilityCard>
        </OpacityBackground>
    );
}

function DialogHeader({ balance_text, onClose }: { balance_text: string; onClose: () => void }) {
    return (
        <div className="relative flex flex-col items-center pb-4 text-center">
            <h2 className="text-xl font-semibold tracking-tight">
                Withdraw{' '}
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
            <p className="mt-1 text-sm text-light-alpha/55">Send USDC to any Solana address</p>
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

interface DestinationInputProps {
    value: string;
    on_change: (next: string) => void;
    on_paste: () => void;
    invalid: boolean;
    self_send: boolean;
}

function DestinationInput({
    value,
    on_change,
    on_paste,
    invalid,
    self_send,
}: DestinationInputProps) {
    const has_error = invalid || self_send;
    return (
        <div className="space-y-1">
            <div className="relative">
                <Input
                    type="text"
                    placeholder="Recipient Solana address"
                    value={value}
                    onChange={(e) => on_change(e.target.value)}
                    spellCheck={false}
                    className={cn(
                        'h-12 pl-4 pr-20 rounded-lg bg-dark-base font-mono text-sm tabular-nums tracking-tight focus-visible:border-light-alpha/30',
                        has_error ? 'border-destructive/60' : 'border-dark-faded',
                    )}
                />
                <Button
                    type="button"
                    variant="ghost"
                    onClick={on_paste}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-full text-[11px] uppercase tracking-wider font-semibold text-light-alpha/60 hover:text-light-alpha bg-dark-faded/60 hover:bg-dark-faded"
                >
                    <PiClipboardText className="size-3.5" />
                    Paste
                </Button>
            </div>
            {invalid && (
                <p className="px-1 text-[11px] text-destructive">Not a valid Solana address</p>
            )}
            {!invalid && self_send && (
                <p className="px-1 text-[11px] text-destructive">
                    You cannot withdraw to your own deposit address
                </p>
            )}
        </div>
    );
}

interface AmountInputProps {
    value: string;
    on_change: (next: string) => void;
    on_max: () => void;
    max_disabled: boolean;
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

function PresetChips({
    disabled,
    on_pick,
}: {
    disabled: boolean;
    on_pick: (amount: number) => void;
}) {
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

interface StatusLineProps {
    insufficient: boolean;
    error: string | null;
    success_signature: string | null;
}

function StatusLine({ insufficient, error, success_signature }: StatusLineProps) {
    if (!insufficient && !error && !success_signature) return null;
    return (
        <div className="px-1 text-xs">
            {insufficient && (
                <p className="text-destructive">Amount exceeds your available balance</p>
            )}
            {error && <p className="text-destructive">{error}</p>}
            {success_signature && (
                <p className="flex items-center gap-1.5 text-emerald-400">
                    <PiCheckCircle className="size-3.5" />
                    Sent ·{' '}
                    <a
                        href={`${SOLSCAN_BASE}${success_signature}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono underline decoration-dotted underline-offset-2 hover:text-emerald-300"
                    >
                        {shorten(success_signature)}
                    </a>
                </p>
            )}
        </div>
    );
}

function NetworkWarning({ network_label }: { network_label: string }) {
    return (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-dark-faded/60 bg-dark-base px-3 py-2.5">
            <PiInfo className="size-4 mt-0.5 shrink-0 text-light-alpha/50" />
            <p className="text-[10.5px] leading-relaxed text-light-alpha/60">
                Sends your custodial USDC on{' '}
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
                        The network your withdrawal is sent on. Withdrawals are irreversible.
                    </TooltipContent>
                </Tooltip>
                . Double-check the destination address — sending to the wrong address means
                permanent loss.
            </p>
        </div>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import OpacityBackground from '@/components/ui/opacity-background';
import UtilityCard from '@/components/ui/utility-card';
import {
    fetchAdminBalances,
    type BalanceCard,
    type BalanceSeverity,
    type BalanceSnapshot,
} from '@/lib/api/admin';

export default function BalanceModalButton() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="h-9 px-4 rounded text-[10px] tracking-[0.25em] uppercase border border-white/15 hover:bg-white/5 text-white/75"
            >
                Balances
            </button>
            <AnimatePresence>
                {open && <BalanceModalInner onClose={() => setOpen(false)} />}
            </AnimatePresence>
        </>
    );
}

function BalanceModalInner({ onClose }: { onClose: () => void }) {
    const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        setRefreshing(true);
        try {
            const data = await fetchAdminBalances();
            setSnapshot(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'failed to load balances');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
         
        void load();
    }, []);

    const rows = snapshot ? build_rows(snapshot) : [];

    return (
        <OpacityBackground onBackgroundClick={onClose} escapeClosing className="bg-neutral-900">
            <UtilityCard
                onClose={onClose}
                className="w-full max-w-md rounded-none border-white/10 px-0 py-0 backdrop-blur-md bg-neutral-950"
            >
                <EdgeTicks />

                <div className="px-7 pt-8 pb-7">
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                            BALANCES / 01
                        </span>
                        <span className="text-[10px] tracking-[0.25em] uppercase text-white/30">
                            SOLMARKET
                        </span>
                    </div>

                    <h1 className="text-xl tracking-tight text-white">Treasury balances</h1>
                    <p className="mt-1.5 text-[10px] tracking-[0.12em] uppercase text-white/35">
                        {snapshot
                            ? `Updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`
                            : 'Loading…'}
                    </p>

                    <div className="mt-6 space-y-1.5">
                        <AnimatePresence mode="wait">
                            {loading && !snapshot ? (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-[11px] tracking-[0.15em] uppercase text-white/35 py-4 text-center"
                                >
                                    Fetching…
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="rows"
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-1.5"
                                >
                                    {rows.map((row) => (
                                        <BalanceRow key={row.label} {...row} />
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                        <button
                            type="button"
                            onClick={load}
                            disabled={refreshing}
                            className="text-[10px] tracking-[0.2em] uppercase text-white/55 hover:text-white/85 disabled:opacity-40"
                        >
                            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
                        </button>
                        <span className="text-[9px] tracking-[0.2em] uppercase text-white/25">
                            v1.0
                        </span>
                    </div>
                </div>
            </UtilityCard>
        </OpacityBackground>
    );
}

interface RowSpec {
    label: string;
    chain: string;
    amount: number;
    unit: string;
    decimals: number;
    severity: BalanceSeverity;
    address: string | null;
    threshold: { warn: number; critical: number };
}

function BalanceRow({
    label,
    chain,
    amount,
    unit,
    decimals,
    severity,
    address,
    threshold,
}: RowSpec) {
    const onClick = () => {
        if (!address) {
            toast.info('No address — wallet unconfigured');
            return;
        }
        navigator.clipboard.writeText(address).then(
            () => toast.success(`${label} address copied`),
            () => toast.error('Could not copy'),
        );
    };

    const rowClass = cn(
        'w-full flex items-center justify-between px-3 py-2.5 border transition-colors text-left group',
        severity === 'critical'
            ? 'border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10'
            : severity === 'warn'
              ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
              : severity === 'unknown'
                ? 'border-white/10 bg-white/3 hover:bg-white/5'
                : 'border-white/10 hover:bg-white/5',
    );

    return (
        <button type="button" onClick={onClick} className={rowClass}>
            <span className="flex items-center gap-2.5 min-w-0">
                <SeverityDot severity={severity} />
                <span className="flex flex-col min-w-0">
                    <span className="text-[11px] tracking-[0.15em] uppercase text-white/80 truncate">
                        {label}
                    </span>
                    <span className="text-[9px] tracking-[0.18em] uppercase text-white/35">
                        {chain} · warn≤{threshold.warn} crit≤{threshold.critical}
                    </span>
                </span>
            </span>
            <span className="flex items-baseline gap-1.5 shrink-0 ml-3">
                <span className="text-sm font-semibold tabular-nums text-white">
                    {format_amount(amount, decimals)}
                </span>
                <span className="text-[9px] tracking-[0.18em] uppercase text-white/40">{unit}</span>
            </span>
        </button>
    );
}

function SeverityDot({ severity }: { severity: BalanceSeverity }) {
    const cls = cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        severity === 'critical' && 'bg-rose-400 animate-pulse',
        severity === 'warn' && 'bg-amber-400',
        severity === 'ok' && 'bg-emerald-400',
        severity === 'unknown' && 'bg-white/30',
    );
    return <span className={cls} />;
}

function EdgeTicks() {
    const base = 'absolute size-2 border-white/30';
    return (
        <>
            <span className={cn(base, '-top-px -left-px border-t border-l')} />
            <span className={cn(base, '-top-px -right-px border-t border-r')} />
            <span className={cn(base, '-bottom-px -left-px border-b border-l')} />
            <span className={cn(base, '-bottom-px -right-px border-b border-r')} />
        </>
    );
}

function format_amount(n: number, decimals: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
}

function build_rows(snapshot: BalanceSnapshot): RowSpec[] {
    const cardAmount = (c: BalanceCard | undefined): number => c?.amount ?? 0;
    const cardSeverity = (c: BalanceCard | undefined): BalanceSeverity => c?.severity ?? 'unknown';

    return [
        {
            label: 'Admin keypair',
            chain: 'Solana · SOL',
            amount: cardAmount(snapshot.solana.adminSol),
            unit: 'SOL',
            decimals: 4,
            severity: cardSeverity(snapshot.solana.adminSol),
            address: snapshot.solana.adminPubkey,
            threshold: snapshot.thresholds.sol,
        },
        {
            label: 'Treasury vault',
            chain: 'Solana · USDC',
            amount: cardAmount(snapshot.solana.treasuryUsdc),
            unit: 'USDC',
            decimals: 2,
            severity: cardSeverity(snapshot.solana.treasuryUsdc),
            address: snapshot.solana.treasuryVaultPda,
            threshold: snapshot.thresholds.usdcVault,
        },
        {
            label: 'Polymarket gas',
            chain: 'Polygon · POL',
            amount: cardAmount(snapshot.polygon.funderPol),
            unit: 'POL',
            decimals: 4,
            severity: cardSeverity(snapshot.polygon.funderPol),
            address: snapshot.polygon.funderAddress,
            threshold: snapshot.thresholds.pol,
        },
        {
            label: 'Polymarket trading',
            chain: 'Polygon · pUSD',
            amount: cardAmount(snapshot.polygon.funderPusd),
            unit: 'pUSD',
            decimals: 2,
            severity: cardSeverity(snapshot.polygon.funderPusd),
            address: snapshot.polygon.funderAddress,
            threshold: snapshot.thresholds.pusd,
        },
    ];
}

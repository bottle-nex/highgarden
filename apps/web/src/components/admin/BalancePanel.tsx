'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    fetchAdminBalances,
    type BalanceCard,
    type BalanceSeverity,
    type BalanceSnapshot,
} from '@/lib/api/admin';

const SEVERITY_CLASSES: Record<
    BalanceSeverity,
    { bg: string; ring: string; dot: string; label: string }
> = {
    ok: {
        bg: 'bg-emerald-500/5',
        ring: 'border border-emerald-500/15',
        dot: 'bg-emerald-400',
        label: 'text-emerald-300/85',
    },
    warn: {
        bg: 'bg-amber-500/5',
        ring: 'border border-amber-500/20',
        dot: 'bg-amber-400',
        label: 'text-amber-300/90',
    },
    critical: {
        bg: 'bg-rose-500/8',
        ring: 'border border-rose-500/30',
        dot: 'bg-rose-400 animate-pulse',
        label: 'text-rose-300',
    },
    unknown: {
        bg: 'bg-white/3',
        ring: 'border border-white/10',
        dot: 'bg-white/30',
        label: 'text-white/45',
    },
};

function format_amount(n: number, decimals: number): string {
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return '0';
    if (n < 0.0001 && n > 0) return n.toExponential(2);
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    });
}

function short_addr(addr: string | null): string {
    if (!addr) return '';
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface CardProps {
    title: string;
    chain: string;
    amount: number;
    unit: string;
    decimals: number;
    severity: BalanceSeverity;
    address: string | null;
    threshold: { warn: number; critical: number };
}

function Card({
    title,
    chain,
    amount,
    unit,
    decimals,
    severity,
    address,
    threshold,
}: CardProps): React.ReactElement {
    const c = SEVERITY_CLASSES[severity];
    return (
        <div className={`${c.bg} ${c.ring} rounded-md p-4 space-y-2 min-w-0`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                    {chain}
                </span>
                <span
                    className={`flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase ${c.label}`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                    {severity === 'unknown' ? 'unconfigured' : severity}
                </span>
            </div>
            <div className="text-[12px] text-white/80">{title}</div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums text-white">
                    {format_amount(amount, decimals)}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                    {unit}
                </span>
            </div>
            <div className="text-[10px] text-white/35 tabular-nums">
                warn ≤ {threshold.warn} · crit ≤ {threshold.critical}
            </div>
            {address && (
                <div
                    className="text-[10px] font-mono text-white/40 cursor-pointer hover:text-white/70 transition-colors"
                    onClick={() => {
                        navigator.clipboard.writeText(address).then(
                            () => toast.success('Address copied'),
                            () => toast.error('Could not copy'),
                        );
                    }}
                    title="Click to copy"
                >
                    {short_addr(address)}
                </div>
            )}
        </div>
    );
}

export default function BalancePanel(): React.ReactElement {
    const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = await fetchAdminBalances();
            setSnapshot(next);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'failed to load balances');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refresh();
    }, [refresh]);

    return (
        <section className="space-y-3">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-sm tracking-wide text-white">Treasury balances</h2>
                    <p className="text-[11px] text-white/45 mt-0.5">
                        {snapshot
                            ? `Updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}`
                            : 'Loading…'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase border border-white/15 hover:bg-white/5 text-white/75 disabled:opacity-50"
                >
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {loading && !snapshot ? (
                <div className="text-xs text-white/40">Loading balances…</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card
                        title="Admin keypair"
                        chain="Solana · SOL"
                        amount={snapshot?.solana.adminSol.amount ?? 0}
                        unit="SOL"
                        decimals={4}
                        severity={derive_severity(snapshot?.solana.adminSol)}
                        address={snapshot?.solana.adminPubkey ?? null}
                        threshold={snapshot?.thresholds.sol ?? { warn: 0.5, critical: 0.05 }}
                    />
                    <Card
                        title="Treasury vault"
                        chain="Solana · USDC"
                        amount={snapshot?.solana.treasuryUsdc.amount ?? 0}
                        unit="USDC"
                        decimals={2}
                        severity={derive_severity(snapshot?.solana.treasuryUsdc)}
                        address={snapshot?.solana.treasuryVaultPda ?? null}
                        threshold={snapshot?.thresholds.usdcVault ?? { warn: 1000, critical: 100 }}
                    />
                    <Card
                        title="Polymarket funder · gas"
                        chain="Polygon · POL"
                        amount={snapshot?.polygon.funderPol.amount ?? 0}
                        unit="POL"
                        decimals={4}
                        severity={derive_severity(snapshot?.polygon.funderPol)}
                        address={snapshot?.polygon.funderAddress ?? null}
                        threshold={snapshot?.thresholds.pol ?? { warn: 1, critical: 0.1 }}
                    />
                    <Card
                        title="Polymarket funder · trades"
                        chain="Polygon · pUSD"
                        amount={snapshot?.polygon.funderPusd.amount ?? 0}
                        unit="pUSD"
                        decimals={2}
                        severity={derive_severity(snapshot?.polygon.funderPusd)}
                        address={snapshot?.polygon.funderAddress ?? null}
                        threshold={snapshot?.thresholds.pusd ?? { warn: 500, critical: 50 }}
                    />
                </div>
            )}
        </section>
    );
}

function derive_severity(card: BalanceCard | undefined): BalanceSeverity {
    return card?.severity ?? 'unknown';
}

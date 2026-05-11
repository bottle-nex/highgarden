'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FiExternalLink } from 'react-icons/fi';
import {
    adminResolveMarket,
    approveAndListOnSolana,
    approveListing,
    rejectListing,
} from '@/lib/api/admin';
import type { AdminListingRow } from './AdminListings';

function formatUsd(n: number | null): string {
    if (n === null) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ListingRow({
    listing,
    onChange,
}: {
    listing: AdminListingRow;
    onChange?: () => void;
}) {
    const [pending, setPending] = useState(false);
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [reason, setReason] = useState('');
    const [showResolveConfirm, setShowResolveConfirm] = useState<'YES' | 'NO' | null>(null);

    const handleResolve = async (winning: 'YES' | 'NO') => {
        if (pending) return;
        setPending(true);
        try {
            const result = await adminResolveMarket(listing.marketId, winning);
            const short = `${result.txSignature.slice(0, 8)}…${result.txSignature.slice(-6)}`;
            toast.success(`Resolved as ${winning}`, { description: `Tx ${short}` });
            setShowResolveConfirm(null);
            onChange?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'resolve failed');
        } finally {
            setPending(false);
        }
    };

    const handleApprove = async () => {
        if (pending) return;
        setPending(true);
        try {
            await approveListing(listing.marketId);
            toast.success('Approved — mirror is now subscribing');
            onChange?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'approve failed');
        } finally {
            setPending(false);
        }
    };

    const handleApproveAndList = async () => {
        if (pending) return;
        setPending(true);
        try {
            await approveAndListOnSolana(listing.marketId);
            toast.success('Approved and listed on Solana');
            onChange?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'approve + list failed');
        } finally {
            setPending(false);
        }
    };

    const handleReject = async () => {
        if (pending) return;
        setPending(true);
        try {
            await rejectListing(listing.marketId, reason || null);
            toast.success('Rejected');
            setShowRejectInput(false);
            setReason('');
            onChange?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'reject failed');
        } finally {
            setPending(false);
        }
    };

    return (
        <li className="border border-white/8 rounded p-4 hover:border-white/20 transition-colors">
            <div className="flex items-start justify-between gap-4">
                {listing.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={listing.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0 bg-white/5"
                    />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm text-white truncate">{listing.question}</p>
                        {listing.polyMarketSlug && (
                            <a
                                href={`https://polymarket.com/event/${listing.polyMarketSlug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
                                title="View on Polymarket"
                            >
                                <FiExternalLink size={13} />
                            </a>
                        )}
                    </div>
                    {listing.description && (
                        <p className="text-xs text-white/45 mt-1 line-clamp-2">
                            {listing.description}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[10px] tracking-wider uppercase text-white/40">
                        <span>vol 24h: {formatUsd(listing.volume24hUsd)}</span>
                        <span>liquidity: {formatUsd(listing.liquidityUsd)}</span>
                        <span>ends: {formatDate(listing.endAt)}</span>
                        <span>discovered: {formatDate(listing.discoveredAt)}</span>
                        {listing.approvedBy && (
                            <span className="text-emerald-300/70">
                                approved by {listing.approvedBy}
                            </span>
                        )}
                        {listing.rejectionReason && (
                            <span className="text-rose-300/70">
                                reason: {listing.rejectionReason}
                            </span>
                        )}
                    </div>
                </div>

                {listing.status === 'PENDING' && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            disabled={pending}
                            onClick={handleApproveAndList}
                            className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40"
                            title="Approve and create the on-chain Market PDA so users can trade it"
                        >
                            Approve & List on Solana
                        </button>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={handleApprove}
                            className="green-btn h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase disabled:opacity-40"
                        >
                            Approve
                        </button>
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => setShowRejectInput((v) => !v)}
                            className="red-btn h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase disabled:opacity-40"
                        >
                            Reject
                        </button>
                    </div>
                )}

                {listing.status === 'APPROVED' && (
                    <div className="flex items-center gap-2 shrink-0">
                        {listing.solanaMarketPda && (
                            <>
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => setShowResolveConfirm('YES')}
                                    className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                                    title="Mimic UMA resolution: sign resolve_market on-chain with YES as winner"
                                >
                                    Resolve YES
                                </button>
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => setShowResolveConfirm('NO')}
                                    className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 disabled:opacity-40"
                                    title="Mimic UMA resolution: sign resolve_market on-chain with NO as winner"
                                >
                                    Resolve NO
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => setShowRejectInput((v) => !v)}
                            className="red-btn h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase disabled:opacity-40"
                        >
                            Delist
                        </button>
                    </div>
                )}
            </div>

            {showResolveConfirm && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-white/3 border border-white/10 rounded">
                    <p className="text-xs text-white/70 flex-1">
                        Resolve <span className="font-semibold text-white">{showResolveConfirm}</span>{' '}
                        as winner? This signs <code className="text-white/85">resolve_market</code>{' '}
                        on-chain and is <span className="text-rose-300">irreversible</span> — users
                        on the losing side can no longer claim.
                    </p>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => setShowResolveConfirm(null)}
                        className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleResolve(showResolveConfirm)}
                        className={
                            showResolveConfirm === 'YES'
                                ? 'h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/45 disabled:opacity-40'
                                : 'h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-rose-500/30 text-rose-100 hover:bg-rose-500/45 disabled:opacity-40'
                        }
                    >
                        Confirm
                    </button>
                </div>
            )}

            {showRejectInput && (
                <div className="mt-3 flex items-center gap-2">
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional reason"
                        className="flex-1 h-8 px-2 bg-white/5 border border-white/10 rounded text-xs text-white outline-none focus:border-white/25"
                    />
                    <button
                        type="button"
                        disabled={pending}
                        onClick={handleReject}
                        className="h-8 px-3 rounded text-[10px] tracking-[0.2em] uppercase bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 disabled:opacity-40"
                    >
                        Confirm
                    </button>
                </div>
            )}
        </li>
    );
}

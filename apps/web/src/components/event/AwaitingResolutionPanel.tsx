'use client';
import { JSX } from 'react';

export default function AwaitingResolutionPanel(): JSX.Element {
    return (
        <div className="px-5 py-6 space-y-4">
            <div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-amber-300/80">
                    Awaiting resolution
                </div>
                <div className="text-[13px] text-white/85 mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="relative flex size-1.5">
                            <span className="absolute inset-0 size-1.5 rounded-full bg-amber-400/70 animate-ping" />
                            <span className="relative size-1.5 rounded-full bg-amber-400" />
                        </span>
                    </span>
                    Round ended — waiting for the on-chain settle.
                </div>
                <p className="text-[11px] text-white/45 mt-2">
                    Buying and selling are closed for this slot. The outcome will appear here in a
                    few seconds, and you can claim then if you held the winning side.
                </p>
            </div>
        </div>
    );
}

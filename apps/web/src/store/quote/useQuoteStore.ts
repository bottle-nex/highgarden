import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { Quote } from '@solmarket/types';
import { Outcome, Side } from '@solmarket/types';

export interface QuoteRequest {
    marketId: string;
    side: Side;
    outcome: Outcome;
    size: number;
}

// The signed quote as returned from POST /quote
export interface SignedQuote extends Pick<
    Quote,
    'nonce' | 'side' | 'outcome' | 'price' | 'size' | 'signature'
> {
    marketId: string;
    expiresAt: number; // epoch ms
}

type QuoteStatus = 'idle' | 'fetching' | 'ready' | 'expired' | 'error';

interface QuoteState {
    current: SignedQuote | null;
    status: QuoteStatus;
    error: string | null;
    /** ms remaining until expiry — updated by the internal timer */
    msRemaining: number;

    // Actions
    set: (quote: SignedQuote) => void;
    setStatus: (s: QuoteStatus, error?: string) => void;
    expire: () => void;
    clear: () => void;
}

// Module-level expiry timer — only one quote is active at a time
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

function clearTimers() {
    if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

export const useQuoteStore = create<QuoteState>()(
    devtools(
        subscribeWithSelector((set, get) => ({
            current: null,
            status: 'idle',
            error: null,
            msRemaining: 0,

            set: (quote) => {
                clearTimers();
                const now = Date.now();
                const msLeft = quote.expiresAt - now;
                if (msLeft <= 0) {
                    // Already expired before we could set it — shouldn't happen in practice
                    set(
                        { current: null, status: 'expired', msRemaining: 0 },
                        false,
                        'quote/expired-on-set',
                    );
                    return;
                }

                set(
                    { current: quote, status: 'ready', error: null, msRemaining: msLeft },
                    false,
                    'quote/set',
                );

                // Countdown ticker (updates every 250ms for smooth UI)
                countdownInterval = setInterval(() => {
                    const remaining = get().current ? get().current!.expiresAt - Date.now() : 0;
                    if (remaining <= 0) {
                        clearTimers();
                        return;
                    }
                    set({ msRemaining: remaining }, false, 'quote/countdown');
                }, 250);

                // Hard expiry
                expiryTimer = setTimeout(() => {
                    clearTimers();
                    set(
                        { current: null, status: 'expired', msRemaining: 0 },
                        false,
                        'quote/expire',
                    );
                }, msLeft);
            },

            setStatus: (status, error) =>
                set({ status, error: error ?? null }, false, 'quote/setStatus'),

            expire: () => {
                clearTimers();
                set({ current: null, status: 'expired', msRemaining: 0 }, false, 'quote/expire');
            },

            clear: () => {
                clearTimers();
                set(
                    { current: null, status: 'idle', error: null, msRemaining: 0 },
                    false,
                    'quote/clear',
                );
            },
        })),
        { name: 'QuoteStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectQuote = (s: QuoteState) => s.current;
export const selectQuoteReady = (s: QuoteState) => s.status === 'ready' && s.current !== null;
export const selectQuoteFetching = (s: QuoteState) => s.status === 'fetching';
export const selectQuoteExpired = (s: QuoteState) => s.status === 'expired';
export const selectMsRemaining = (s: QuoteState) => s.msRemaining;

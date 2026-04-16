import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PriceUpdatePayload } from '@solmarket/types';
import { Outcome } from '@solmarket/types';
import { makeBookKey } from './useOrderBookStore';

type BookKey = string;

export interface LastTrade {
    marketId: string;
    outcome: Outcome;
    price: number;
    updatedAt: number; // epoch ms
}

interface LastTradeState {
    byKey: Record<BookKey, LastTrade>;
    apply: (payload: PriceUpdatePayload) => void;
    clear: (marketId: string) => void;
}

export const useLastTradeStore = create<LastTradeState>()(
    devtools(
        (set) => ({
            byKey: {},

            apply: (payload) =>
                set(
                    (s) => {
                        const key = makeBookKey(payload.marketId, payload.outcome);
                        const ts = new Date(payload.updatedAt).getTime();
                        const prev = s.byKey[key];
                        // Drop stale updates
                        if (prev && ts <= prev.updatedAt) return s;
                        return {
                            byKey: {
                                ...s.byKey,
                                [key]: {
                                    marketId: payload.marketId,
                                    outcome: payload.outcome,
                                    // Last trade price is mid of best bid/ask
                                    price: (payload.bestBid + payload.bestAsk) / 2,
                                    updatedAt: ts,
                                },
                            },
                        };
                    },
                    false,
                    'lastTrade/apply',
                ),

            clear: (marketId) =>
                set(
                    (s) => {
                        const byKey = { ...s.byKey };
                        let changed = false;
                        for (const outcome of [Outcome.YES, Outcome.NO]) {
                            const key = makeBookKey(marketId, outcome);
                            if (key in byKey) {
                                delete byKey[key];
                                changed = true;
                            }
                        }
                        return changed ? { byKey } : s;
                    },
                    false,
                    'lastTrade/clear',
                ),
        }),
        { name: 'LastTradeStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectLastTrade = (marketId: string, outcome: Outcome) => (s: LastTradeState) =>
    s.byKey[makeBookKey(marketId, outcome)];

export const selectLastTradePrice = (marketId: string, outcome: Outcome) => (s: LastTradeState) =>
    s.byKey[makeBookKey(marketId, outcome)]?.price;

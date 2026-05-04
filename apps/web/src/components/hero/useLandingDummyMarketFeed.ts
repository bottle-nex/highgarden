'use client';

import { useEffect } from 'react';
import { Outcome } from '@solmarket/types';
import {
    enqueueDepthChanges,
    enqueueDepthSnapshot,
    useOrderBookDepthStore,
    type DepthChange,
} from '@/store/book/useOrderBookDepthStore';
import { useOrderBookStore } from '@/store/book/useOrderBookStore';

export const LANDING_DEMO_MARKET_ID = 'landing-demo-market';

const TICK_MS = 380;
const NUM_LEVELS = 12;

interface MutableLevel {
    price: number;
    size: number;
}

interface MutableBook {
    bids: MutableLevel[];
    asks: MutableLevel[];
}

function round_2(n: number): number {
    return Math.round(n * 100) / 100;
}

function round_3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

function rand_size(level_idx: number): number {
    const base = 350 + Math.random() * 4200 + level_idx * 280;
    return round_2(base);
}

function build_book(center: number): MutableBook {
    const bids: MutableLevel[] = [];
    const asks: MutableLevel[] = [];
    for (let i = 0; i < NUM_LEVELS; i++) {
        const bid_price = round_3(center - 0.005 - i * 0.01);
        const ask_price = round_3(center + 0.005 + i * 0.01);
        if (bid_price > 0.01 && bid_price < 0.99) {
            bids.push({ price: bid_price, size: rand_size(i) });
        }
        if (ask_price > 0.01 && ask_price < 0.99) {
            asks.push({ price: ask_price, size: rand_size(i) });
        }
    }
    return { bids, asks };
}

function clone_book(book: MutableBook): MutableBook {
    return {
        bids: book.bids.map((l) => ({ price: l.price, size: l.size })),
        asks: book.asks.map((l) => ({ price: l.price, size: l.size })),
    };
}

function mutate_sizes(book: MutableBook): DepthChange[] {
    const changes: DepthChange[] = [];
    const num = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < num; i++) {
        const use_bids = Math.random() < 0.5;
        const arr = use_bids ? book.bids : book.asks;
        if (arr.length === 0) continue;
        const max_idx = Math.min(8, arr.length);
        const idx = Math.floor(Math.random() * max_idx);
        const lvl = arr[idx]!;
        const delta = (Math.random() - 0.4) * 1600;
        const new_size = Math.max(60, lvl.size + delta);
        lvl.size = round_2(new_size);
        changes.push({
            price: lvl.price,
            size: lvl.size,
            side: use_bids ? 'BUY' : 'SELL',
        });
    }
    return changes;
}

function shift_best(book: MutableBook): DepthChange[] {
    const changes: DepthChange[] = [];
    const shift_ask = Math.random() < 0.5;
    const direction: -1 | 1 = Math.random() < 0.5 ? -1 : 1;

    if (shift_ask && book.asks.length > 0) {
        const old = book.asks[0]!;
        const new_price = round_3(old.price + direction * 0.01);
        const top_bid = book.bids[0]?.price ?? 0;
        if (new_price <= top_bid || new_price >= 0.99) return changes;
        // Zero out the old top
        changes.push({ price: old.price, size: 0, side: 'SELL' });
        book.asks.shift();
        const new_top: MutableLevel = { price: new_price, size: rand_size(0) };
        book.asks.unshift(new_top);
        book.asks.sort((a, b) => a.price - b.price);
        changes.push({ price: new_top.price, size: new_top.size, side: 'SELL' });
        return changes;
    }

    if (!shift_ask && book.bids.length > 0) {
        const old = book.bids[0]!;
        const new_price = round_3(old.price + direction * 0.01);
        const top_ask = book.asks[0]?.price ?? 1;
        if (new_price >= top_ask || new_price <= 0.01) return changes;
        changes.push({ price: old.price, size: 0, side: 'BUY' });
        book.bids.shift();
        const new_top: MutableLevel = { price: new_price, size: rand_size(0) };
        book.bids.unshift(new_top);
        book.bids.sort((a, b) => b.price - a.price);
        changes.push({ price: new_top.price, size: new_top.size, side: 'BUY' });
    }

    return changes;
}

/**
 * Seeds and continuously mutates a fake order book under a sentinel market id.
 * Drives the existing depth store, which in turn powers `EventOrderBook`,
 * `EventTradePanel`, and `ProbabilityHeadline`. Cleans up on unmount.
 */
export function useLandingDummyMarketFeed(): void {
    useEffect(() => {
        const yes_book: MutableBook = build_book(0.31);
        const no_book: MutableBook = build_book(0.7);
        const seed_ts = Date.now();

        enqueueDepthSnapshot(
            LANDING_DEMO_MARKET_ID,
            Outcome.YES,
            clone_book(yes_book).bids,
            clone_book(yes_book).asks,
            seed_ts,
        );
        enqueueDepthSnapshot(
            LANDING_DEMO_MARKET_ID,
            Outcome.NO,
            clone_book(no_book).bids,
            clone_book(no_book).asks,
            seed_ts,
        );

        let tick_count = 0;
        const interval_id = window.setInterval(() => {
            tick_count++;
            const ts = Date.now();

            const yes_changes = mutate_sizes(yes_book);
            const no_changes = mutate_sizes(no_book);

            // Every ~5 ticks (~1.9s), shift the best price on one side so the
            // YES/NO percentage flashes and the top-of-book moves visibly.
            if (tick_count % 5 === 0) {
                yes_changes.push(...shift_best(yes_book));
            }
            if (tick_count % 7 === 0) {
                no_changes.push(...shift_best(no_book));
            }

            if (yes_changes.length > 0) {
                enqueueDepthChanges(LANDING_DEMO_MARKET_ID, Outcome.YES, yes_changes, ts);
            }
            if (no_changes.length > 0) {
                enqueueDepthChanges(LANDING_DEMO_MARKET_ID, Outcome.NO, no_changes, ts);
            }
        }, TICK_MS);

        return () => {
            window.clearInterval(interval_id);
            useOrderBookDepthStore.getState().clear(LANDING_DEMO_MARKET_ID);
            useOrderBookStore.getState().clear(LANDING_DEMO_MARKET_ID);
        };
    }, []);
}

'use client';
import { useEffect } from 'react';
import { SERVER_MESSAGE_TYPE, type ServerMessageHandler } from '@solmarket/types';
import SingletonSocket from '@/lib/socket/singleton-socket';
import { useWebSocket } from '@/lib/socket/useWebSocket';
import { useStreamStore } from '@/store/stream/useStreamStore';
import portfolio_api from '@/lib/api/portfolio';
import { usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { useFillsStore } from '@/store/portfolio/useFillsStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

export function usePortfolioSync(): void {
    useWebSocket();
    const session = useUserSessionStore((s) => s.session);
    const hydrate_positions = usePositionsStore((s) => s.hydrate);
    const set_pos_loading = usePositionsStore((s) => s.setLoading);
    const set_pos_error = usePositionsStore((s) => s.setError);
    const reset_positions = usePositionsStore((s) => s.reset);
    const hydrate_fills = useFillsStore((s) => s.hydrate);
    const set_fills_loading = useFillsStore((s) => s.setLoading);
    const set_fills_error = useFillsStore((s) => s.setError);
    const reset_fills = useFillsStore((s) => s.reset);

    useEffect(() => {
        reset_positions();
        reset_fills();
        if (!session) return;
        let cancelled = false;
        let running = false;
        let refresh_requested = false;
        const refresh_positions = async (): Promise<void> => {
            if (cancelled) return;
            if (running) {
                refresh_requested = true;
                return;
            }
            running = true;
            try {
                const positions = await portfolio_api.fetch_positions();
                if (!cancelled) hydrate_positions(positions);
            } catch (err) {
                if (!cancelled) {
                    set_pos_error(err instanceof Error ? err.message : 'failed to load positions');
                    set_pos_loading(false);
                }
            } finally {
                running = false;
                if (refresh_requested && !cancelled) {
                    refresh_requested = false;
                    void refresh_positions();
                }
            }
        };
        const on_resolution: ServerMessageHandler<SERVER_MESSAGE_TYPE.MARKET_RESOLVED> = ({
            payload,
        }) => {
            if (
                usePositionsStore.getState().positions.some((p) => p.marketId === payload.marketId)
            ) {
                void refresh_positions();
            }
        };
        SingletonSocket.on(SERVER_MESSAGE_TYPE.MARKET_RESOLVED, on_resolution);
        const unsubscribe = useStreamStore.subscribe((current, previous) => {
            if (current.status === 'open' && previous.status !== 'open') void refresh_positions();
        });
        // Also catches dispute reversals, which carry no MARKET_RESOLVED event.
        const interval = setInterval(() => {
            const awaiting = usePositionsStore
                .getState()
                .positions.some(
                    (p) =>
                        p.status === 'OPEN' &&
                        (p.marketStatus === 'RESOLVED' ||
                            p.marketStatus === 'PAUSED' ||
                            new Date(p.endAt).getTime() <= Date.now()),
                );
            if (awaiting) void refresh_positions();
        }, 3_000);
        set_pos_loading(true);
        set_fills_loading(true);
        void refresh_positions();
        portfolio_api
            .fetch_fills()
            .then((fills) => {
                if (!cancelled) hydrate_fills(fills);
            })
            .catch((err) => {
                if (!cancelled) {
                    set_fills_error(err instanceof Error ? err.message : 'failed to load fills');
                    set_fills_loading(false);
                }
            });
        return () => {
            cancelled = true;
            clearInterval(interval);
            unsubscribe();
            SingletonSocket.off(SERVER_MESSAGE_TYPE.MARKET_RESOLVED, on_resolution);
        };
    }, [
        session,
        hydrate_positions,
        set_pos_loading,
        set_pos_error,
        reset_positions,
        hydrate_fills,
        set_fills_loading,
        set_fills_error,
        reset_fills,
    ]);
}

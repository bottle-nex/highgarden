'use client';
import { useEffect } from 'react';
import portfolio_api from '@/lib/api/portfolio';
import { usePositionsStore } from '@/store/portfolio/usePositionsStore';
import { useFillsStore } from '@/store/portfolio/useFillsStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

export function usePortfolioSync(): void {
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
        if (!session) {
            reset_positions();
            reset_fills();
            return;
        }
        let cancelled = false;
        set_pos_loading(true);
        set_fills_loading(true);
        portfolio_api
            .fetch_positions()
            .then((positions) => {
                if (!cancelled) hydrate_positions(positions);
            })
            .catch((err) => {
                if (!cancelled) {
                    set_pos_error(err instanceof Error ? err.message : 'failed to load positions');
                    set_pos_loading(false);
                }
            });
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

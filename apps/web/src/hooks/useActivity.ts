'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityDTO, ActivityPageDTO } from '@solmarket/types';
import portfolio_api from '@/lib/api/portfolio';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

interface ActivityState {
    key: string;
    items: ActivityDTO[];
    nextCursor: string | null;
    loading: boolean;
    loaded: boolean;
    error: string | null;
}

export function useActivity(search: string, beforeRefresh?: () => void) {
    const user_id = useUserSessionStore((s) => s.session?.user?.id);
    const query = search.trim();
    const key = JSON.stringify([user_id, query]);
    const [state, set_state] = useState<ActivityState>({
        key,
        items: [],
        nextCursor: null,
        loading: true,
        loaded: false,
        error: null,
    });
    const actions = useRef<{ loadMore: () => void; retry: () => void } | null>(null);

    useEffect(() => {
        let disposed = false;
        let busy = false;
        let failed_refresh = false;
        let snapshot: ActivityState = {
            key,
            items: [],
            nextCursor: null,
            loading: !!user_id,
            loaded: false,
            error: null,
        };
        const controller = new AbortController();
        const publish = () => {
            if (!disposed) set_state({ ...snapshot });
        };
        const fetch_page = (cursor: string | null): Promise<ActivityPageDTO> =>
            portfolio_api.fetch_activity(
                { search: query || undefined, cursor: cursor ?? undefined },
                controller.signal,
            );

        const load = async (refresh: boolean) => {
            if (
                !user_id ||
                disposed ||
                busy ||
                (!refresh && snapshot.loaded && !snapshot.nextCursor)
            )
                return;
            busy = true;
            failed_refresh = refresh;
            snapshot = { ...snapshot, loading: true, error: null };
            publish();
            try {
                const previous = snapshot.items;
                const oldest = previous.at(-1);
                let cursor = refresh ? null : snapshot.nextCursor;
                let page: ActivityPageDTO;
                const fetched: ActivityDTO[] = [];
                do {
                    page = await fetch_page(cursor);
                    if (disposed) return;
                    fetched.push(...page.items);
                    cursor = page.nextCursor;
                    const last = page.items.at(-1);
                    // Refresh through the oldest loaded item, even if new rows shifted page boundaries.
                    if (
                        !refresh ||
                        !oldest ||
                        !last ||
                        last.createdAt < oldest.createdAt ||
                        (last.createdAt === oldest.createdAt && last.id <= oldest.id)
                    )
                        break;
                } while (cursor);
                const merged = new Map(
                    (refresh ? fetched : [...previous, ...fetched]).map((item) => [item.id, item]),
                );
                if (refresh && previous.length) beforeRefresh?.();
                snapshot = {
                    key,
                    items: [...merged.values()],
                    nextCursor: cursor,
                    loading: false,
                    loaded: true,
                    error: null,
                };
            } catch (error) {
                if (disposed) return;
                snapshot = {
                    ...snapshot,
                    loading: false,
                    error: error instanceof Error ? error.message : 'Failed to load activity',
                };
            } finally {
                busy = false;
                publish();
            }
        };
        const current_actions = {
            loadMore: () => {
                if (!snapshot.error) void load(false);
            },
            retry: () => {
                void load(failed_refresh || !snapshot.loaded);
            },
        };
        actions.current = current_actions;
        const focus = () => {
            if (!snapshot.error) void load(true);
        };
        window.addEventListener('focus', focus);
        const timer = window.setInterval(() => {
            if (
                document.visibilityState === 'visible' &&
                !snapshot.error &&
                snapshot.items.some((item) => item.status === 'PENDING')
            )
                void load(true);
        }, 15_000);
        // Defers the first publish to async work, including account/search reset.
        void Promise.resolve().then(() => {
            if (!disposed) {
                publish();
                void load(true);
            }
        });
        return () => {
            disposed = true;
            controller.abort();
            clearInterval(timer);
            window.removeEventListener('focus', focus);
            if (actions.current === current_actions) actions.current = null;
        };
    }, [user_id, query, key, beforeRefresh]);

    const loadMore = useCallback(() => actions.current?.loadMore(), []);
    const retry = useCallback(() => actions.current?.retry(), []);
    const current =
        state.key === key && user_id
            ? state
            : { items: [], loading: !!user_id, loaded: false, error: null, nextCursor: null };
    return {
        items: current.items,
        loading: current.loading,
        initialLoading: current.loading && !current.loaded,
        error: current.error,
        exhausted: current.loaded && current.nextCursor === null,
        loadMore,
        retry,
    };
}

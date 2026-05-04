import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { add_bookmark, fetch_bookmark_ids, remove_bookmark } from '@/lib/api/bookmarks';

interface BookmarksState {
    ids: Set<string>;
    fetchStatus: 'idle' | 'loading' | 'ready' | 'error';
    error: string | null;
    /** Marker so callers can disambiguate "no bookmarks yet" from "not loaded". */
    hydrated: boolean;

    hydrate: () => Promise<void>;
    reset: () => void;
    is_bookmarked: (market_id: string) => boolean;
    /** Optimistic toggle. Returns the new state, or rolls back on failure. */
    toggle: (market_id: string) => Promise<boolean>;
}

export const useBookmarksStore = create<BookmarksState>()(
    devtools(
        (set, get) => ({
            ids: new Set<string>(),
            fetchStatus: 'idle',
            error: null,
            hydrated: false,

            hydrate: async () => {
                if (get().fetchStatus === 'loading') return;
                set({ fetchStatus: 'loading', error: null }, false, 'bookmarks/hydrate:start');
                try {
                    const ids = await fetch_bookmark_ids();
                    set(
                        {
                            ids: new Set(ids),
                            fetchStatus: 'ready',
                            error: null,
                            hydrated: true,
                        },
                        false,
                        'bookmarks/hydrate:ok',
                    );
                } catch (err) {
                    set(
                        {
                            fetchStatus: 'error',
                            error: err instanceof Error ? err.message : 'failed to load bookmarks',
                        },
                        false,
                        'bookmarks/hydrate:err',
                    );
                }
            },

            reset: () =>
                set(
                    {
                        ids: new Set<string>(),
                        fetchStatus: 'idle',
                        error: null,
                        hydrated: false,
                    },
                    false,
                    'bookmarks/reset',
                ),

            is_bookmarked: (market_id) => get().ids.has(market_id),

            toggle: async (market_id) => {
                const prev = get().ids;
                const was_bookmarked = prev.has(market_id);
                const next = new Set(prev);
                if (was_bookmarked) next.delete(market_id);
                else next.add(market_id);
                set({ ids: next }, false, 'bookmarks/toggle:optimistic');

                try {
                    if (was_bookmarked) await remove_bookmark(market_id);
                    else await add_bookmark(market_id);
                    return !was_bookmarked;
                } catch (err) {
                    // Roll back to the previous set so the UI doesn't lie about
                    // server state.
                    set({ ids: prev }, false, 'bookmarks/toggle:rollback');
                    throw err;
                }
            },
        }),
        { name: 'BookmarksStore' },
    ),
);

export const select_is_bookmarked = (market_id: string) => (s: BookmarksState) =>
    s.ids.has(market_id);

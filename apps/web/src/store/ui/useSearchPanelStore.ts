import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const MAX_RECENTS = 10;

interface SearchPanelStore {
    open: boolean;
    /** Market ids the user has opened from the search panel, most-recent first */
    recents: string[];
    setOpen: (v: boolean) => void;
    toggle: () => void;
    addRecent: (id: string) => void;
    removeRecent: (id: string) => void;
}

export const useSearchPanelStore = create<SearchPanelStore>()(
    persist(
        (set, get) => ({
            open: false,
            recents: [],
            setOpen: (v) => set({ open: v }),
            toggle: () => set({ open: !get().open }),
            addRecent: (id) =>
                set((s) => ({
                    recents: [id, ...s.recents.filter((x) => x !== id)].slice(0, MAX_RECENTS),
                })),
            removeRecent: (id) =>
                set((s) => ({
                    recents: s.recents.filter((x) => x !== id),
                })),
        }),
        {
            name: 'search-panel-store',
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({ recents: s.recents }),
        },
    ),
);

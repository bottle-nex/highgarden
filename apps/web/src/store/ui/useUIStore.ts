import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { Outcome, Side } from '@solmarket/types';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
    id: string;
    message: string;
    variant: ToastVariant;
    durationMs: number;
}

export interface TradePanelContext {
    marketId: string;
    defaultSide: Side;
    defaultOutcome: Outcome;
}

interface UIState {
    /** Currently viewed market id — set when user opens a market page */
    selectedMarketId: string | null;
    /** Trade panel state: null = closed */
    tradePanel: TradePanelContext | null;
    /** Active toast notifications */
    toasts: Toast[];
    /** Whether the mobile market list sidebar is open */
    sidebarOpen: boolean;

    // Actions
    setSelectedMarket: (id: string | null) => void;
    openTradePanel: (ctx: TradePanelContext) => void;
    closeTradePanel: () => void;
    toast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
    dismissToast: (id: string) => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>()(
    devtools(
        persist(
            (set) => ({
                selectedMarketId: null,
                tradePanel: null,
                toasts: [],
                sidebarOpen: false,

                setSelectedMarket: (selectedMarketId) =>
                    set({ selectedMarketId }, false, 'ui/setSelectedMarket'),

                openTradePanel: (tradePanel) => set({ tradePanel }, false, 'ui/openTradePanel'),

                closeTradePanel: () => set({ tradePanel: null }, false, 'ui/closeTradePanel'),

                toast: (message, variant = 'info', durationMs = 4000) =>
                    set(
                        (s) => ({
                            toasts: [
                                ...s.toasts,
                                { id: String(++toastCounter), message, variant, durationMs },
                            ],
                        }),
                        false,
                        'ui/toast',
                    ),

                dismissToast: (id) =>
                    set(
                        (s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }),
                        false,
                        'ui/dismissToast',
                    ),

                setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }, false, 'ui/setSidebarOpen'),

                toggleSidebar: () =>
                    set((s) => ({ sidebarOpen: !s.sidebarOpen }), false, 'ui/toggleSidebar'),
            }),
            {
                name: 'ui-store',
                storage: createJSONStorage(() => localStorage),
                // Only persist sidebar preference — everything else resets on load
                partialize: (s) => ({ sidebarOpen: s.sidebarOpen }),
            },
        ),
        { name: 'UIStore' },
    ),
);

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectSelectedMarketId = (s: UIState) => s.selectedMarketId;
export const selectTradePanel = (s: UIState) => s.tradePanel;
export const selectToasts = (s: UIState) => s.toasts;
export const selectSidebarOpen = (s: UIState) => s.sidebarOpen;

import { create } from 'zustand';

interface WithdrawDialogStore {
    open: boolean;
    setOpen: (v: boolean) => void;
    toggle: () => void;
}

export const useWithdrawDialogStore = create<WithdrawDialogStore>()((set, get) => ({
    open: false,
    setOpen: (v) => set({ open: v }),
    toggle: () => set({ open: !get().open }),
}));

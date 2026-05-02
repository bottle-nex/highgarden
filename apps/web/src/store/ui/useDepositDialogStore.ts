import { create } from 'zustand';

interface DepositDialogStore {
    open: boolean;
    setOpen: (v: boolean) => void;
    toggle: () => void;
}

export const useDepositDialogStore = create<DepositDialogStore>()((set, get) => ({
    open: false,
    setOpen: (v) => set({ open: v }),
    toggle: () => set({ open: !get().open }),
}));

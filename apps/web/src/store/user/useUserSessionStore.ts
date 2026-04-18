import { create } from 'zustand';
import { CustomSession } from '../../../app/api/auth/[...nextauth]/options';

interface UserSessionStoreType {
    session: CustomSession | null;
    openSigninModal: boolean;
    openLogoutModal: boolean;

    setOpenLogoutModal: (open: boolean) => void;
    setSession: (data: CustomSession | null) => void;
    setOpenSigninModal: (open: boolean) => void;
}

export const useUserSessionStore = create<UserSessionStoreType>()((set) => ({
    session: null,
    openSigninModal: false,
    openLogoutModal: false,

    setSession: (data: CustomSession | null) => set({ session: data }),
    setOpenSigninModal: (open: boolean) => set({ openSigninModal: open }),
    setOpenLogoutModal: (open: boolean) => set({ openLogoutModal: open }),
}));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CustomSession } from '../../../app/api/auth/[...nextauth]/options';

interface UserSessionStoreType {
    session: CustomSession | null;
    openSigninModal: boolean;
    openLogoutModal: boolean;

    tutorialComplete: boolean | null;
    setTutorialComplete: (val: boolean) => void;

    setOpenLogoutModal: (open: boolean) => void;
    setSession: (data: CustomSession | null) => void;
    setOpenSigninModal: (open: boolean) => void;
}

export const useUserSessionStore = create<UserSessionStoreType>()(
    persist(
        (set) => ({
            session: null,
            openSigninModal: false,
            openLogoutModal: false,
            tutorialComplete: null,

            setSession: (data: CustomSession | null) => set({ session: data }),
            setOpenSigninModal: (open: boolean) => set({ openSigninModal: open }),
            setOpenLogoutModal: (open: boolean) => set({ openLogoutModal: open }),

            setTutorialComplete: (val: boolean) => set({ tutorialComplete: val }),
        }),
        {
            name: 'user-session',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                session: state.session,
                tutorialComplete: state.tutorialComplete,
            }),
        },
    ),
);

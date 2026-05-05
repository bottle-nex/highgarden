'use client';

import { useCallback } from 'react';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

/**
 * Gate a callback behind authentication. If the user is signed in, the action
 * runs; otherwise the global sign-in modal opens and the action is skipped.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   <button onClick={() => requireAuth(() => doTrade())}>Buy</button>
 *
 * Returns `true` if the action was executed, `false` if the modal was opened
 * instead — handy for early-return patterns inside async handlers.
 */
export function useRequireAuth() {
    const session = useUserSessionStore((s) => s.session);
    const setOpenSigninModal = useUserSessionStore((s) => s.setOpenSigninModal);

    return useCallback(
        (action?: () => void | Promise<void>): boolean => {
            if (!session?.user) {
                setOpenSigninModal(true);
                return false;
            }
            void action?.();
            return true;
        },
        [session, setOpenSigninModal],
    );
}

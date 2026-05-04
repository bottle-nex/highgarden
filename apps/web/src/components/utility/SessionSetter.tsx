'use client';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useBookmarksStore } from '@/store/bookmarks/useBookmarksStore';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export default function SessionSetter() {
    const { setSession } = useUserSessionStore();
    const session = useSession();

    useEffect(() => {
        if (session.status === 'authenticated') {
            setSession(session.data);
            // Hydrate bookmarks once we have a token in the axios client.
            useBookmarksStore.getState().hydrate();
        } else if (session.status === 'unauthenticated') {
            setSession(null);
            useBookmarksStore.getState().reset();
        }
    }, [session.status, session.data, setSession]);

    return null;
}

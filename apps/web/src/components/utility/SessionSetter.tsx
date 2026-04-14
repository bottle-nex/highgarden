'use client';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export default function SessionSetter() {
    const { setSession } = useUserSessionStore();
    const session = useSession();

    useEffect(() => {
        if (session.status === 'authenticated') {
            setSession(session.data);
        } else if (session.status === 'unauthenticated') {
            setSession(null);
        }
    }, [session.status, session.data, setSession]);

    return null;
}

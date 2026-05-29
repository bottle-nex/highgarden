import axios from 'axios';
import { signOut } from 'next-auth/react';
import { API_URL } from '@/routes/routes.api';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

export const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use((config) => {
    const token = useUserSessionStore.getState().session?.user?.token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Single in-flight guard so a burst of parallel 401s (e.g. several
// queries fire on page load after the server's JWT secret rotated)
// doesn't trigger N parallel signOut calls. Reset in `finally` so a
// later genuine 401 can still trigger logout if needed.
let logout_in_flight = false;

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        const code = error?.response?.data?.error?.code;
        const is_unauthorized = status === 401 || code === 'NOT_AUTHORIZED';

        if (is_unauthorized && !logout_in_flight) {
            logout_in_flight = true;
            try {
                // Drop the in-memory session so any logged-in UI flips
                // back to logged-out immediately.
                useUserSessionStore.getState().setSession(null);
                // Clear next-auth's HTTP-only session cookie. `redirect:
                // false` keeps navigation under the calling component's
                // control — the interceptor shouldn't yank the user off
                // their current page mid-request.
                await signOut({ redirect: false });
            } catch {
                // Swallow — caller's error rejection below is the
                // signal that matters; signOut hygiene is best-effort.
            } finally {
                logout_in_flight = false;
            }
        }

        return Promise.reject(error);
    },
);

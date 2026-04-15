import axios from 'axios';
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

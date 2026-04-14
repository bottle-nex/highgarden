import { getServerSession } from 'next-auth';
import { authOption } from '../../app/api/auth/[...nextauth]/options';
import { API_URL } from '@/routes/routes.api';

export async function apiFetch(path: string, init: RequestInit = {}) {
    const session = await getServerSession(authOption);
    const token = session?.user?.token ?? null;

    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (token) {
        headers.set('authorization', `Bearer ${token}`);
    }
    return fetch(`${API_URL}${path}`, { ...init, headers });
}

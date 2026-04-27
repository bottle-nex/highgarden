import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOption } from '../api/auth/[...nextauth]/options';
import { isAdminEmail } from '@/lib/auth/admin';
import AdminPanel from '@/components/admin/AdminPanel';

export default async function AdminPage() {
    const session = await getServerSession(authOption);
    if (!isAdminEmail(session?.user?.email)) {
        redirect('/dashboard');
    }
    return <AdminPanel />;
}

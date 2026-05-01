import { JSX } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import CategorySection from '@/components/dashboard/CategorySection';

export default function DashboardPage(): JSX.Element {
    return (
        <DashboardLayout>
            <CategorySection />
        </DashboardLayout>
    );
}

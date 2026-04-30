import { JSX, ReactNode } from 'react';
import DashboardNavbar from './DashboardNavbar';
import CategoryTabs from './CategoryTabs';

export default function DashboardLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div className="min-h-screen w-full bg-dark-base text-white/65" data-lenis-prevent>
            <DashboardNavbar />
            <CategoryTabs />
            <main className="mx-auto w-full max-w-360 px-6 lg:px-8 py-14">{children}</main>
        </div>
    );
}

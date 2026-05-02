import { JSX, ReactNode } from 'react';
import DashboardNavbar from './DashboardNavbar';
import CategoryTabs from './CategorySidebar';

export default function DashboardLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div className="min-h-screen w-full bg-dark-alpha text-white/65 flex" data-lenis-prevent>
            <CategoryTabs />
            <div className="flex-1 min-w-0 flex flex-col">
                <DashboardNavbar />
                <main className="flex-1 w-full px-6 lg:px-8 py-14">{children}</main>
            </div>
        </div>
    );
}

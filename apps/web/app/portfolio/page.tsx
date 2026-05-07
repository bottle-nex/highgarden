import { JSX } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import PortfolioCard from '@/components/portfolio/PortfolioCard';
import ProfitLossCard from '@/components/portfolio/ProfitLossCard';
import ClaimBanner from '@/components/portfolio/ClaimBanner';
import PortfolioTabs from '@/components/portfolio/PortfolioTabs';
import PortfolioBootstrap from '@/components/portfolio/PortfolioBootstrap';

export default function PortFolioPage(): JSX.Element {
    return (
        <DashboardLayout>
            <PortfolioBootstrap />
            <main data-lenis-prevent className="max-w-240 mx-auto text-white flex flex-col gap-y-4">
                <section className="w-full grid grid-cols-2 gap-x-4">
                    <PortfolioCard />
                    <ProfitLossCard />
                </section>
                <ClaimBanner />
                <PortfolioTabs />
            </main>
        </DashboardLayout>
    );
}

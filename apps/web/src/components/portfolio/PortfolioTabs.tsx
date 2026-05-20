'use client';
import { JSX, useState } from 'react';
import { LuSearch, LuArrowUpDown } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PositionsTable from './PositionsTable';
import HistoryTable from './HistoryTable';
import { UpcomingBadge } from './UpcomingBadge';
import { PORTFOLIO_TABS, type PortfolioTab } from './types';

export default function PortfolioTabs(): JSX.Element {
    const [activeTab, setActiveTab] = useState<PortfolioTab>('Positions');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const renderTabContent = (): JSX.Element => {
        switch (activeTab) {
            case 'Positions':
                return <PositionsTable />;
            case 'Open orders':
                return (
                    <div className="mt-6 py-16 px-6 text-center border border-white/8 bg-dark-base rounded-lg flex flex-col items-center gap-y-3">
                        <UpcomingBadge label="Coming Soon" />
                        <p className="text-white/85 text-sm font-medium">
                            Open orders are on the way
                        </p>
                        <p className="text-white/45 text-xs max-w-sm leading-relaxed">
                            Track and manage your pending limit orders here once they ship.
                        </p>
                    </div>
                );
            case 'History':
                return <HistoryTable search={searchQuery} />;
        }
    };

    return (
        <section className="mt-2">
            <div className="flex items-center gap-x-5 sm:gap-x-7 border-b border-white/8 overflow-x-auto">
                {PORTFOLIO_TABS.map((tab) => {
                    const isActive = tab === activeTab;
                    return (
                        <Button
                            key={tab}
                            variant="ghost"
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'h-auto rounded-none px-0 pb-3 text-sm font-medium bg-transparent border-none shrink-0 whitespace-nowrap transition-colors',
                                isActive
                                    ? 'text-white border-b-2 border-alpha hover:bg-transparent hover:text-white'
                                    : 'text-white/45 hover:bg-transparent hover:text-white/75',
                            )}
                        >
                            {tab}
                        </Button>
                    );
                })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-4">
                <div className="relative w-full sm:flex-1">
                    <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4" />
                    <Input
                        placeholder="Search markets"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-10 pl-9 bg-dark-base border-white/8 rounded-lg w-full text-sm placeholder:text-white/30 focus-visible:border-white/20"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => {}}
                    title="Sorting coming soon"
                    className="h-10 px-3.5 border-white/8 bg-dark-base text-xs text-white/65 hover:bg-dark-base hover:text-white rounded-lg w-full sm:w-auto justify-center gap-x-2 font-medium"
                >
                    <LuArrowUpDown className="size-3.5" />
                    Current value
                    <UpcomingBadge />
                </Button>
            </div>

            {renderTabContent()}
        </section>
    );
}

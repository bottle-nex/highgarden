'use client';
import { JSX, useState } from 'react';
import { LuSearch, LuArrowUpDown } from 'react-icons/lu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PositionsTable from './PositionsTable';
import EmptyTabState from './EmptyTabState';
import { PORTFOLIO_TABS, type PortfolioTab } from './types';

export default function PortfolioTabs(): JSX.Element {
    const [activeTab, setActiveTab] = useState<PortfolioTab>('Positions');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const renderTabContent = (): JSX.Element => {
        switch (activeTab) {
            case 'Positions':
                return <PositionsTable />;
            case 'Open orders':
                return <EmptyTabState label="Open orders" />;
            case 'History':
                return <EmptyTabState label="History" />;
        }
    };

    return (
        <section>
            <div className="flex items-center gap-x-6 border-b border-neutral-900">
                {PORTFOLIO_TABS.map((tab) => {
                    const isActive = tab === activeTab;
                    return (
                        <Button
                            key={tab}
                            variant="ghost"
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                'h-auto rounded-none px-0 pb-3 text-sm bg-transparent border-none',
                                isActive
                                    ? 'text-white border-b-2 border-primary hover:bg-transparent hover:text-white'
                                    : 'text-white/50 hover:bg-transparent hover:text-white/80',
                            )}
                        >
                            {tab}
                        </Button>
                    );
                })}
            </div>

            <div className="flex items-center gap-x-3 mt-4">
                <div className="relative flex-1">
                    <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                    <Input
                        placeholder="Search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="h-10 pl-9 bg-dark-alpha border-neutral-900 rounded-none"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => console.log('sort toggled')}
                    className="h-10 px-4 border-neutral-900 bg-dark-alpha text-sm text-white/70 hover:bg-dark-alpha hover:text-white"
                >
                    <LuArrowUpDown className="size-3.5" />
                    Current value
                </Button>
            </div>

            {renderTabContent()}
        </section>
    );
}

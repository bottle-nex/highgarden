export type PortfolioTab = 'Positions' | 'Open orders' | 'History' | 'Activity';
export type ProfitTimeRange = '1D' | '1W' | '1M' | 'ALL';

export const PORTFOLIO_TABS: readonly PortfolioTab[] = [
    'Positions',
    'Open orders',
    'History',
    'Activity',
];
export const PROFIT_TIME_RANGES: readonly ProfitTimeRange[] = ['1D', '1W', '1M', 'ALL'];

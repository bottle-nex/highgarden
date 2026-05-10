import { JSX } from 'react';
import { cn } from '@/lib/utils';
import { HiArrowTrendingUp, HiArrowTrendingDown, HiMinus } from 'react-icons/hi2';
import { dashboardStats, type DashboardStat } from '@/utils/constants';

export default function StatsStrip(): JSX.Element {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/8 border border-white/10 rounded-[6px] overflow-hidden">
            {dashboardStats.map((stat) => (
                <StatCell key={stat.label} stat={stat} />
            ))}
        </div>
    );
}

function StatCell({ stat }: { stat: DashboardStat }): JSX.Element {
    const Icon =
        stat.trend === 'up'
            ? HiArrowTrendingUp
            : stat.trend === 'down'
              ? HiArrowTrendingDown
              : HiMinus;

    const trendColor =
        stat.trend === 'up'
            ? 'text-emerald-500/70'
            : stat.trend === 'down'
              ? 'text-rose-500/70'
              : 'text-white/45';

    return (
        <div className="group relative bg-neutral-950 px-3 sm:px-5 py-4 sm:py-5 overflow-hidden hover:bg-neutral-900/70 transition-colors">
            <div className="flex items-center justify-between  text-[11px] tracking-[0.22em] text-white/45 uppercase">
                <span>{stat.label}</span>
                <Icon className={cn('size-3.5', trendColor)} />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
                <span className="text-lg sm:text-2xl text-white/80 tabular-nums font-light">
                    {stat.value}
                </span>
                <span className={cn(' text-[12px] tabular-nums', trendColor)}>{stat.delta}</span>
            </div>
        </div>
    );
}

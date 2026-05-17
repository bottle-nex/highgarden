import { JSX } from 'react';
import { cn } from '@/lib/utils';

export function UpcomingBadge({
    className,
    label = 'Soon',
}: {
    className?: string;
    label?: string;
}): JSX.Element {
    return (
        <span
            className={cn(
                'inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-alpha/15 text-alpha border border-alpha/30 whitespace-nowrap',
                className,
            )}
        >
            {label}
        </span>
    );
}

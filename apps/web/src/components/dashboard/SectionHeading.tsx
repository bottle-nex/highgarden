import { JSX } from 'react';

interface Props {
    title: string;
    subtitle?: string;
}

export default function SectionHeading({ title, subtitle }: Props): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5">
            <h2 className="text-sm sm:text-base tracking-wide text-white/75 flex items-center gap-2 sm:gap-2.5 min-w-0">
                {title}
            </h2>
            {subtitle && (
                <span className="text-[10px] sm:text-[11px] tracking-widest text-white/45 shrink-0 text-right">
                    {subtitle}
                </span>
            )}
        </div>
    );
}

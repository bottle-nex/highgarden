import { JSX } from 'react';

interface Props {
    title: string;
    subtitle?: string;
}

export default function SectionHeading({ title, subtitle }: Props): JSX.Element {
    return (
        <div className="flex items-center justify-between mb-5">
            <h2 className="text-base tracking-wide text-white/75 flex items-center gap-2.5">
                {title}
            </h2>
            {subtitle && (
                <span className="text-[11px] tracking-widest text-white/45">{subtitle}</span>
            )}
        </div>
    );
}

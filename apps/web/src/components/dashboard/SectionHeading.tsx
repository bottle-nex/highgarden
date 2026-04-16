import { JSX } from 'react';

interface Props {
    title: string;
    subtitle?: string;
}

export default function SectionHeading({ title, subtitle }: Props): JSX.Element {
    return (
        <div className="flex items-center justify-between mb-7">
            <h2 className="font-mono text-[11px] tracking-[0.3em] text-white/75 uppercase font-semibold flex items-center gap-2.5">
                <span className="inline-block size-1.5 rounded-full bg-indigo-500/70" />
                {title}
            </h2>
            {subtitle && (
                <span className="font-mono text-[9px] tracking-[0.25em] text-white/45 uppercase">
                    {subtitle}
                </span>
            )}
        </div>
    );
}

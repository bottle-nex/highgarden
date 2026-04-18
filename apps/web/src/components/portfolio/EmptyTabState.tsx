import { JSX } from 'react';

export default function EmptyTabState({ label }: { label: string }): JSX.Element {
    return (
        <div className="mt-8 py-16 text-center text-white/40 text-sm border border-neutral-900 bg-dark-alpha">
            No {label.toLowerCase()} yet
        </div>
    );
}

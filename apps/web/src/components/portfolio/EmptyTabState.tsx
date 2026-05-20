import { JSX } from 'react';

export default function EmptyTabState({ label }: { label: string }): JSX.Element {
    return (
        <div className="mt-6 py-16 text-center text-white/45 text-sm border border-white/8 bg-dark-base rounded-lg">
            No {label.toLowerCase()} yet
        </div>
    );
}

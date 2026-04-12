import { JSX } from 'react';

export default function CardHeader({
    label,
    context,
}: {
    label: string;
    context: string;
}): JSX.Element {
    return (
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="text-neutral-300">{label}</span>
            <span className="text-neutral-600">[{context}]</span>
        </div>
    );
}

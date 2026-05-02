'use client';

import { JSX, useState } from 'react';
import { toast } from 'sonner';
import type { MarketDTO } from '@solmarket/types';
import Image from 'next/image';

function placeholder_gradient(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 60) % 360;
    return `linear-gradient(135deg, hsl(${h}, 65%, 22%), hsl(${h2}, 70%, 14%))`;
}

interface Props {
    market: MarketDTO;
}

export default function EventTitleBlock({ market }: Props): JSX.Element {
    const handle_share = () => toast.info('Share link coming soon');
    const handle_bookmark = () => toast.info('Bookmark coming soon');
    const handle_embed = () => toast.info('Embed coming soon');
    const [img_error, set_img_error] = useState(false);

    const show_image = !!market.imageUrl && !img_error;

    return (
        <header className="flex items-start gap-5">
            <div
                className="shrink-0 w-16 h-16 rounded-md border border-white/10 overflow-hidden"
                style={show_image ? undefined : { background: placeholder_gradient(market.id) }}
                aria-hidden
            >
                {show_image && (
                    <Image
                        src={market.imageUrl!}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => set_img_error(true)}
                        width={64}
                        height={64}
                    />
                )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
                <h1 className="text-2xl text-white leading-snug font-medium">{market.name}</h1>
                {market.description && (
                    <p className="text-sm text-white/55 leading-relaxed line-clamp-2 max-w-3xl">
                        {market.description}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <IconButton label="Embed" onClick={handle_embed}>
                    {'<>'}
                </IconButton>
                <IconButton label="Share" onClick={handle_share}>
                    ↗
                </IconButton>
                <IconButton label="Bookmark" onClick={handle_bookmark}>
                    ☆
                </IconButton>
            </div>
        </header>
    );
}

function IconButton({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="w-8 h-8 grid place-items-center rounded-md border border-white/10 hover:border-white/25 text-white/55 hover:text-white text-xs  cursor-pointer"
        >
            {children}
        </button>
    );
}

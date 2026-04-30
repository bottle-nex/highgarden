'use client';

import { JSX, useState } from 'react';

interface Props {
    description: string;
}

const TABS = ['RULES', 'MARKET CONTEXT'] as const;
type Tab = (typeof TABS)[number];

export default function EventTabs({ description }: Props): JSX.Element {
    const [active, set_active] = useState<Tab>('RULES');

    return (
        <section className="border border-white/10 rounded-[6px] bg-neutral-950/60">
            <header className="flex items-center gap-6 px-5 pt-5 border-b border-white/8">
                {TABS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => set_active(t)}
                        className={`pb-3 font-mono text-[10px] tracking-[0.25em] uppercase border-b-2 transition-colors cursor-pointer ${
                            active === t
                                ? 'border-yellow-300/80 text-white'
                                : 'border-transparent text-white/40 hover:text-white/70'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </header>

            <div className="px-5 py-5 text-sm text-white/65 leading-relaxed whitespace-pre-line">
                {active === 'MARKET CONTEXT' ? (
                    description ? (
                        description
                    ) : (
                        <span className="text-white/35">No additional context provided.</span>
                    )
                ) : (
                    <span className="text-white/55">
                        Resolution rules from the source market apply. This market resolves to YES
                        if the underlying Polymarket question resolves YES, and NO otherwise.
                        Detailed structured rules will surface here as they&apos;re indexed.
                    </span>
                )}
            </div>
        </section>
    );
}

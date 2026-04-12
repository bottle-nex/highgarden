'use client';

import { JSX, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { IoIosArrowRoundForward } from 'react-icons/io';

type CardId = 'marketing' | 'sanity' | 'pricing';

interface CardConfig {
    id: CardId;
    label: string;
    context: string;
    questions: string[];
    activeBg: string;
    activeInk: string;
    accentText: string;
    arrowBg: string;
    arrowInk: string;
    questionHover: string;
}

const CARDS: CardConfig[] = [
    {
        id: 'marketing',
        label: 'TRADER DESK',
        context: 'MARKETS, LIQUIDITY',
        questions: [
            'WHY IS THE BOOK ALREADY DEEP ON DAY ONE?',
            'HOW TIGHT ARE THE SPREADS ON SOLMARKET?',
            'WHICH MARKETS HAVE THE MOST VOLUME RIGHT NOW?',
        ],
        activeBg: 'bg-[#ffff00]',
        activeInk: 'text-black',
        accentText: 'text-[#ffff00]',
        arrowBg: 'bg-[#ffff00]',
        arrowInk: 'text-black',
        questionHover: 'hover:bg-[#ffff00] hover:text-black',
    },
    {
        id: 'sanity',
        label: 'HOW IT WORKS',
        context: 'PROTOCOL, DOCS',
        questions: [
            'HOW DOES SOLMARKET MIRROR POLYMARKET LIQUIDITY?',
            'WHAT HAPPENS WHEN A MARKET RESOLVES?',
            'HOW IS MY USDC CUSTODIED ON SOLANA?',
        ],
        activeBg: 'bg-[#ff4000]',
        activeInk: 'text-black',
        accentText: 'text-[#ff4000]',
        arrowBg: 'bg-[#ff4000]',
        arrowInk: 'text-black',
        questionHover: 'hover:bg-[#ff4000] hover:text-black',
    },
    {
        id: 'pricing',
        label: 'FEES & SETTLEMENT',
        context: 'FEES, PAYOUTS',
        questions: [
            'WHAT FEES DO I PAY TO TRADE A MARKET?',
            'HOW FAST DO WINNINGS SETTLE TO MY WALLET?',
            'WHAT HAPPENS IF A MARKET IS DISPUTED?',
        ],
        activeBg: 'bg-[#1F5BFF]',
        activeInk: 'text-white',
        accentText: 'text-[#1F5BFF]',
        arrowBg: 'bg-[#1F5BFF]',
        arrowInk: 'text-white',
        questionHover: 'hover:bg-[#1F5BFF] hover:text-white',
    },
];

const INACTIVE_BG =
    'bg-black bg-[radial-gradient(rgba(255,255,255,0.592)_1px,transparent_1px)] [background-size:9px_9px]';

export default function LandingFeatureCardsSection(): JSX.Element {
    const [activeId, setActiveId] = useState<CardId>('sanity');

    return (
        <section className="w-full py-20">
            <section className="max-w-340 mx-auto w-full grid grid-cols-2">
                <div className="col-span-1">
                    <h1 className="text-5xl">
                        One prediction market. Every edge Solana gives you.
                    </h1>
                </div>
                <div className="col-span-1">
                    <p className="text-2xl">
                        SolMarket fuses Polymarket-grade liquidity with sub-second Solana execution,
                        so you can trade real-world outcomes without bridging, waiting, or paying
                        Polygon gas.
                    </p>
                </div>
            </section>
            <div className="grid w-full grid-cols-1 gap-0 md:grid-cols-3 mt-20">
                {CARDS.map((card) => {
                    const isActive = activeId === card.id;
                    const stateClasses = isActive
                        ? `${card.activeBg} ${card.activeInk}`
                        : `${INACTIVE_BG} text-neutral-500`;
                    return (
                        <div
                            key={card.id}
                            onClick={() => setActiveId(card.id)}
                            className={`group relative aspect-square overflow-hidden text-left font-mono uppercase tracking-wider transition-colors duration-300 ease-in-out ${stateClasses}`}
                        >
                            {isActive ? (
                                <ActiveCard card={card} />
                            ) : (
                                <InactiveCard label={card.label} />
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function InactiveCard({ label }: { label: string }): JSX.Element {
    const [isHovered, setIsHovered] = useState<boolean>(false);
    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="flex h-full w-full flex-col p-20"
        >
            <div className="h-2.25" aria-hidden />
            <div className="relative mt-2 flex flex-1 items-center justify-center bg-black p-3">
                <span className="text-sm text-neutral-500">{label}</span>
                <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-neutral-600">
                    [ CLICK TO SEE ]
                </span>
                {isHovered && <EdgeArrows borderColor="border-white/70" />}
            </div>
            <div className="mt-2 h-2.25" aria-hidden />
        </div>
    );
}

function ActiveCard({ card }: { card: CardConfig }): JSX.Element {
    return (
        <div className="flex h-full w-full flex-col p-20 relative">
            <div className="flex items-center justify-between text-[10px]">
                <span>AGENT CONTEXT</span>
                <span className="flex items-center gap-1">
                    <span>CURRENT CONTEXT:</span>
                    <span className={`bg-black px-1 py-0.5 ${card.accentText}`}>
                        {card.context}
                    </span>
                </span>
            </div>

            <div className="mt-3 flex flex-1 flex-col justify-end gap-2 bg-black p-4 relative">
                {card.questions.map((q) => (
                    <div
                        key={q}
                        className={cn(
                            'self-end border border-white/15 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 cursor-pointer',
                            card.questionHover,
                        )}
                    >
                        {q}
                    </div>
                ))}
                <div className="mt-2 relative">
                    <Input
                        type="text"
                        placeholder="ASK THE AI AGENT A QUESTION..."
                        className="h-auto rounded-none border border-white/15 bg-neutral-950 px-3 py-2.5 pr-12 text-sm uppercase tracking-wider font-mono text-neutral-200 placeholder:text-neutral-500 md:text-sm"
                    />
                    <span
                        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-base leading-none ${card.arrowBg} ${card.arrowInk}`}
                    >
                        ↑
                    </span>
                </div>
                <EdgeArrows />
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1">
                    <span>STATUS:</span>
                    <span className={`bg-black px-1 py-0.5 ${card.accentText}`}>ENABLED</span>
                </span>
                <span className="cursor-pointer hover:underline underline-offset-2 flex items-center gap-x-px">
                    LEARN MORE <IoIosArrowRoundForward className="size-4" />
                </span>
            </div>
        </div>
    );
}

export function EdgeArrows({ borderColor = 'border-black' }: { borderColor?: string }) {
    return (
        <>
            <span
                className={`aspect-square w-4 h-4 absolute -bottom-5 -right-5 border ${borderColor} border-r-0 border-b-0`}
            />
            <span
                className={`aspect-square w-4 h-4 absolute -top-5 -right-5 border ${borderColor} border-r-0 border-t-0`}
            />
            <span
                className={`aspect-square w-4 h-4 absolute -bottom-5 -left-5 border ${borderColor} border-l-0 border-b-0`}
            />
            <span
                className={`aspect-square w-4 h-4 absolute -top-5 -left-5 border ${borderColor} border-l-0 border-t-0`}
            />
        </>
    );
}

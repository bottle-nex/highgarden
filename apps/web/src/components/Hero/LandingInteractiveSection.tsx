'use client';
import { JSX, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface InteractiveSectionType {
    id: number;
    slug: string;
    title: string;
    description: string;
    bullets: string[];
    cta: string;
}

const sections: InteractiveSectionType[] = [
    {
        id: 1,
        slug: 'pick-a-market',
        title: 'Pick a market',
        description:
            'Browse live event markets — elections, crypto prices, sports, macro. Every market on SolMarket is backed by a real, resolving outcome, not a vibe. Prices, depth and history are streamed in real time.',
        bullets: [
            'Live markets across politics, crypto, sports and macro',
            'Real resolution sources, not vibes',
            'Streaming prices, depth and trade history',
            'Search and filter by category, volume or close date',
        ],
        cta: 'EXPLORE MARKETS',
    },
    {
        id: 2,
        slug: 'instant-quote',
        title: 'Get an instant quote',
        description:
            'Click YES or NO and SolMarket returns a signed, time-bounded quote. The price you see is the price you trade — no slippage surprises, no waiting for a maker to show up.',
        bullets: [
            'Signed, time-bounded quotes on every click',
            'Zero slippage between quote and fill',
            'No waiting for a counterparty to show up',
            'Transparent fees, baked into the price',
        ],
        cta: 'SEE A QUOTE',
    },
    {
        id: 3,
        slug: 'trade-on-solana',
        title: 'Trade on Solana',
        description:
            'Sign one transaction from your Solana wallet. USDC moves, shares mint into your position, and the fill confirms in under a second. No bridging, no wrapped assets, no Polygon detour.',
        bullets: [
            'One signature from your Solana wallet',
            'Native USDC in, position shares out',
            'Sub-second confirmation on mainnet',
            'No bridges, no wrapped assets, no detours',
        ],
        cta: 'CONNECT WALLET',
    },
    {
        id: 4,
        slug: 'hedged-in-real-time',
        title: 'Hedged in real time',
        description:
            'Behind the scenes, every fill is offset against Polymarket within seconds. That is how SolMarket stays neutral, spreads stay tight, and the book stays deep from day one.',
        bullets: [
            'Every fill offset against Polymarket in seconds',
            'Venue stays delta-neutral at all times',
            'Tight spreads and deep books from day one',
            'Hedge telemetry auditable on-chain',
        ],
        cta: 'HEDGING DETAILS',
    },
    {
        id: 5,
        slug: 'settle-and-claim',
        title: 'Settle and claim',
        description:
            'When the market resolves, winning shares are redeemable 1:1 for USDC on Solana. Claim whenever you want — one click, one signature, straight to your wallet.',
        bullets: [
            'Winning shares redeem 1:1 for USDC',
            'Claim on your schedule, no deadline',
            'One click, one signature, straight to wallet',
            'Settlement fully on Solana — no bridging back',
        ],
        cta: 'CLAIM FLOW',
    },
];

export default function LandingInteractiveSection(): JSX.Element {
    const sectionRef = useRef<HTMLElement>(null);
    const [activeSection, setActiveSection] = useState<number>(0);

    useEffect(() => {
        let rafId = 0;
        function update() {
            rafId = 0;
            const el = sectionRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const viewportH = window.innerHeight;
            const total = rect.height - viewportH;
            if (total <= 0) {
                setActiveSection(0);
                return;
            }
            const scrolled = Math.min(Math.max(-rect.top, 0), total);
            const progress = scrolled / total;
            const idx = Math.min(
                sections.length - 1,
                Math.max(0, Math.floor(progress * sections.length)),
            );
            setActiveSection(idx);
        }
        const onScroll = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);

    function scrollToSection(i: number) {
        const el = sectionRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const total = rect.height - viewportH;
        if (total <= 0) return;
        const sectionTop = rect.top + window.scrollY;
        const target = sectionTop + (i / sections.length) * total + 1;
        window.scrollTo({ top: target, behavior: 'smooth' });
    }

    return (
        <section ref={sectionRef} className="w-full relative h-[500vh] bg-black text-white">
            <main className="relative grid grid-cols-[16.5%_33.5%_50%] items-start w-full h-full">
                <div className="w-full sticky top-10 h-screen flex flex-col gap-y-4 p-4">
                    <ul className="flex flex-col font-mono text-white gap-y-2 mt-8">
                        {sections.map((section, i) => {
                            const isActive = i === activeSection;
                            return (
                                <li
                                    key={section.id}
                                    onClick={() => scrollToSection(i)}
                                    className="flex items-center gap-x-3 cursor-pointer group"
                                >
                                    <span
                                        className={cn(
                                            'flex h-6 w-6 items-center justify-center border tabular-nums text-xs transition-colors font-mono',
                                            isActive
                                                ? 'border-white bg-white text-black'
                                                : 'border-transparent text-white/70 group-hover:bg-alpha group-hover:text-dark-alpha',
                                        )}
                                    >
                                        {section.id.toString().padStart(2, '0')}
                                    </span>
                                    <h2
                                        className={cn(
                                            'text-sm tracking-wider uppercase transition-colors',
                                            isActive ? 'text-white' : 'text-white/60',
                                        )}
                                    >
                                        {section.title}
                                    </h2>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="h-full w-full bg-[radial-gradient(rgba(255,255,255,0.592)_0.5px,transparent_1px)] bg-size-[8px_8px]" />
                </div>

                <div className="w-full h-full flex flex-col">
                    {sections.map((section) => (
                        <article
                            key={section.id}
                            className="h-screen w-full flex flex-col justify-center px-4 pr-12"
                        >
                            <h3 className="text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight text-white">
                                {section.title}
                            </h3>
                            <p className="mt-8 text-xl leading-relaxed text-white/80 max-w-xl">
                                {section.description}
                            </p>
                            <ul className="mt-8 space-y-3 text-lg text-white/90 max-w-xl">
                                {section.bullets.map((b) => (
                                    <li key={b} className="flex items-start gap-x-3">
                                        <span
                                            aria-hidden
                                            className="mt-[0.55rem] h-1.5 w-1.5 rounded-full bg-white/80 shrink-0"
                                        />
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-10">
                                <button
                                    type="button"
                                    className="font-mono text-xs tracking-[0.2em] uppercase px-6 py-3 rounded-full border border-white/80 text-white hover:bg-white hover:text-black transition-colors"
                                >
                                    {section.cta}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>

                <div className="w-full sticky top-10 h-screen flex items-center justify-center p-8">
                    <div className="relative w-full h-full"></div>
                </div>
            </main>
        </section>
    );
}

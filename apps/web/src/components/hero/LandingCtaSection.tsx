'use client';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Bitcount_Grid_Double } from 'next/font/google';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { Button } from '../ui/button';
import { EdgeArrows } from './LandingFeatureCardsSection';

export const bitcountGridDouble = Bitcount_Grid_Double({
    subsets: ['latin'],
    weight: ['400'],
    display: 'swap',
});

interface Slide {
    index: string;
    stat: { value: string; label: string };
    quote: string;
    author: string;
    role: string;
    context: string;
}

const slides: Slide[] = [
    {
        index: '01',
        stat: { value: '<400ms', label: 'AVG FILL TIME' },
        quote: "SolMarket finally brings prediction markets to Solana without the UX tax. No bridging, no wrapped assets — just one signature and you're in.",
        author: 'ALEX KUMAR',
        role: 'Head of DeFi Research, Drift Protocol',
        context: 'DRIFT × MARINADE',
    },
    {
        index: '02',
        stat: { value: '12K+', label: 'ACTIVE TRADERS' },
        quote: 'The Polymarket-backed liquidity is a game changer. Day-one depth that took other platforms months to build, available instantly on Solana.',
        author: 'SARAH CHEN',
        role: 'Portfolio Manager, Sino Global Capital',
        context: 'JUPITER × PHANTOM',
    },
    {
        index: '03',
        stat: { value: '1:1', label: 'USDC SETTLEMENT' },
        quote: 'We evaluated every prediction market on Solana. SolMarket is the only one where settlement is fully native — no bridges, no IOUs, just USDC in your wallet.',
        author: 'MARCUS WRIGHT',
        role: 'CTO, Helius Labs',
        context: 'TENSOR × HELIUS',
    },
];

const slideTransition = { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const };

export default function LandingCtaSection(): JSX.Element {
    const sectionRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [activeSlide, setActiveSlide] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const isVisible = useInView(sectionRef, { amount: 0.15, once: false });

    useEffect(() => {
        if (isVisible && videoRef.current) {
            videoRef.current.play();
        }
    }, [isVisible]);

    const goToSlide = useCallback(
        (idx: number) => {
            if (idx === activeSlide || isTransitioning) return;
            setIsTransitioning(true);
            setActiveSlide(idx);
            setTimeout(() => setIsTransitioning(false), 500);
        },
        [activeSlide, isTransitioning],
    );

    useEffect(() => {
        if (!isVisible) return;
        const timer = setInterval(() => {
            setIsTransitioning(true);
            setActiveSlide((prev) => (prev + 1) % slides.length);
            setTimeout(() => setIsTransitioning(false), 500);
        }, 6000);
        return () => clearInterval(timer);
    }, [isVisible]);

    const slide = slides[activeSlide]!;

    return (
        <section
            ref={sectionRef}
            className="relative w-full h-screen shrink-0 overflow-hidden bg-black"
        >
            {/* video background */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover scale-[1.323]"
                src="/videos/porsche.mp4"
                muted
                loop
                playsInline
                preload="auto"
            />

            {/* <div className="absolute inset-0 bg-black/55" /> */}
            {/* <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-black/40" /> */}

            {/* content */}
            <motion.main
                className="relative z-10 h-full flex flex-col justify-between"
                animate={{ opacity: isVisible ? 1 : 0 }}
                transition={{ duration: 0.7 }}
            >
                {/* ── Top section: stat + metadata + slide nav ── */}
                <section className="px-8 md:px-12 lg:px-16 pt-32">
                    <div className="flex items-start justify-between">
                        {/* Left: stat block */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeSlide}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={slideTransition}
                            >
                                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-alpha/80 mb-4">
                                    {slide.context}
                                </div>
                                <div
                                    className={cn(
                                        'text-6xl md:text-7xl lg:text-8xl tracking-tighter text-white leading-none',
                                        bitcountGridDouble.className,
                                    )}
                                >
                                    {slide.stat.value}
                                </div>
                                <div className="mt-2 font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase text-white/35">
                                    {slide.stat.label}
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* Right: metadata + slide nav */}
                        <div className="flex flex-col items-end gap-y-4">
                            <div className="flex items-center gap-x-3 font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
                                <span>PROOF</span>
                                <span className="w-6 h-px bg-white/20" />
                                <span>ECOSYSTEM VOICES</span>
                            </div>
                            <div className="flex items-center gap-x-1">
                                {slides.map((s, i) => (
                                    <Button
                                        variant={'ghost'}
                                        key={i}
                                        onClick={() => goToSlide(i)}
                                        className={cn(
                                            'w-7 h-7 flex items-center justify-center font-mono text-[10px] border transition-all duration-300 rounded-none hover:bg-transparent',
                                            i === activeSlide
                                                ? 'border-white bg-white text-black'
                                                : 'border-white/15 text-white/30 hover:border-white/40 hover:text-white/60',
                                        )}
                                    >
                                        {s.index}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Spacer to push bottom content down */}
                <div className="flex-1" />

                {/* ── Bottom: quote block + CTA ── */}
                <div className="px-8 md:px-12 lg:px-16 pb-10">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-16 gap-y-6 items-end">
                        {/* Quote */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeSlide}
                                className="max-w-2xl"
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={slideTransition}
                            >
                                <div className="relative border-l border-white/10 pl-6">
                                    <p className="text-sm md:text-[15px] leading-[1.7] text-white/70 font-light">
                                        &ldquo;{slide.quote}&rdquo;
                                    </p>
                                    <div className="mt-5 flex items-center gap-x-4">
                                        <div className="w-5 h-px bg-white/20" />
                                        <div>
                                            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/90">
                                                {slide.author}
                                            </p>
                                            <p className="font-mono text-[10px] tracking-widest text-white/30 mt-0.5">
                                                {slide.role}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* CTA block */}
                        <div className="relative shrink-0">
                            <div className="relative border border-white/10 hover:border-white/20 bg-white/3 backdrop-blur-sm px-8 py-5 cursor-pointer group">
                                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 mb-3">
                                    GET STARTED
                                </div>
                                <button
                                    type="button"
                                    className="font-mono text-xs tracking-[0.2em] uppercase text-white group-hover:text-alpha transition-colors duration-300 flex items-center gap-x-3 group"
                                >
                                    <span>START TRADING</span>
                                    <span className="w-6 h-px bg-white/30 group-hover:bg-alpha group-hover:w-10 transition-all duration-300" />
                                    <span className="text-white/30 group-hover:text-alpha transition-colors duration-300">
                                        &rarr;
                                    </span>
                                </button>
                                <EdgeArrows borderColor="border-white/10 group-hover:border-white/20" />
                            </div>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-8 flex items-center gap-x-3">
                        {slides.map((_, i) => (
                            <div key={i} className="flex-1 h-px relative overflow-hidden">
                                <div className="absolute inset-0 bg-white/8" />
                                <motion.div
                                    className="absolute inset-y-0 left-0 bg-white/40"
                                    initial={{ width: '0%' }}
                                    animate={{
                                        width:
                                            i === activeSlide
                                                ? '100%'
                                                : i < activeSlide
                                                  ? '100%'
                                                  : '0%',
                                        opacity: i < activeSlide ? 0.2 : 1,
                                    }}
                                    transition={
                                        i === activeSlide
                                            ? { duration: 6, ease: 'linear' }
                                            : { duration: 0.3 }
                                    }
                                    key={`${i}-${activeSlide}`}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </motion.main>
        </section>
    );
}

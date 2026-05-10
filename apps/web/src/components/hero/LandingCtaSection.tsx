'use client';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Bitcount_Grid_Double } from 'next/font/google';
import { useRouter } from 'next/navigation';
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
    const router = useRouter();
    const sectionRef = useRef<HTMLElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [activeSlide, setActiveSlide] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const isVisible = useInView(sectionRef, { amount: 0.15, once: false });
    const [tint_opacity, set_tint_opacity] = useState(0);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        let raf_id = 0;
        let last = -1;
        const tick = () => {
            const sec = sectionRef.current;
            const next = sec?.nextElementSibling as HTMLElement | null;
            if (next) {
                const vh = window.innerHeight;
                const top = next.getBoundingClientRect().top;
                const progress = Math.min(1, Math.max(0, 1 - top / vh));
                const next_opacity = Math.min(1, progress * 1.6);
                if (Math.abs(next_opacity - last) > 0.005) {
                    last = next_opacity;
                    set_tint_opacity(next_opacity);
                }
            }
            raf_id = window.requestAnimationFrame(tick);
        };
        raf_id = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf_id);
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const src = '/videos/hero/master.m3u8';

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            const onLoaded = () => setVideoReady(true);
            video.addEventListener('loadedmetadata', onLoaded);
            return () => video.removeEventListener('loadedmetadata', onLoaded);
        }

        let cancelled = false;
        let hls: import('hls.js').default | undefined;
        import('hls.js').then(({ default: Hls }) => {
            if (cancelled || !Hls.isSupported()) return;
            hls = new Hls({
                abrEwmaDefaultEstimate: 10_000_000,
            });
            hls.loadSource(src);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (hls) hls.nextLevel = hls.levels.length - 1;
                setVideoReady(true);
            });
        });

        return () => {
            cancelled = true;
            hls?.destroy();
        };
    }, []);

    useEffect(() => {
        if (isVisible && videoReady && videoRef.current) {
            videoRef.current.play().catch(() => {});
        }
    }, [isVisible, videoReady]);

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
            className="w-full h-screen shrink-0 overflow-hidden bg-dark-alpha sticky top-0"
        >
            {/* video background */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover scale-[1.323] opacity-55"
                muted
                loop
                playsInline
            />

            {/* <div className="absolute inset-0 bg-neutral-950/55" /> */}
            {/* <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-black/40" /> */}

            {/* scroll-driven tint that darkens the CTA as the text section scrolls over it */}
            <div
                className="absolute inset-0 bg-black pointer-events-none z-20"
                style={{ opacity: tint_opacity }}
            />

            {/* content */}
            <motion.main
                className="relative z-10 h-full flex flex-col justify-between"
                animate={{ opacity: isVisible ? 1 : 0 }}
                transition={{ duration: 0.7 }}
            >
                {/* ── Top section: stat + metadata + slide nav ── */}
                <section className="px-4 sm:px-8 md:px-12 lg:px-16 pt-16 sm:pt-24 lg:pt-32">
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
                                <div className=" text-[10px] tracking-[0.25em] uppercase text-alpha/80 mb-4">
                                    {slide.context}
                                </div>
                                <div
                                    className={cn(
                                        'text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tighter text-white leading-none',
                                        bitcountGridDouble.className,
                                    )}
                                >
                                    {slide.stat.value}
                                </div>
                                <div className="mt-2  text-[10px] md:text-xs tracking-[0.2em] uppercase text-white/35">
                                    {slide.stat.label}
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* Right: metadata + slide nav */}
                        <div className="flex flex-col items-end gap-y-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] tracking-[0.2em] uppercase text-white/40">
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
                                            'w-7 h-7 flex items-center justify-center  text-[10px] border transition-all duration-300 rounded-none hover:bg-transparent',
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

                <div className="flex-1" />

                <div className="px-4 sm:px-8 md:px-12 lg:px-16 pb-8 sm:pb-10">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-8 lg:gap-x-16 gap-y-6 items-start md:items-end">
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
                                            <p className=" text-[10px] tracking-[0.15em] uppercase text-white/90">
                                                {slide.author}
                                            </p>
                                            <p className=" text-[10px] tracking-widest text-white/30 mt-0.5">
                                                {slide.role}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        <div className="relative shrink-0">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => router.push('/dashboard')}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        router.push('/dashboard');
                                    }
                                }}
                                className="relative border border-white/10 hover:border-white/20 bg-white/3 backdrop-blur-sm px-5 sm:px-8 py-4 sm:py-5 cursor-pointer group outline-none focus-visible:border-white/40"
                            >
                                <div className=" text-[10px] tracking-[0.2em] uppercase text-white/30 mb-3">
                                    GO TO DASHBOARD
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push('/dashboard');
                                    }}
                                    className=" text-xs tracking-[0.2em] uppercase text-white group-hover:text-alpha transition-colors duration-300 flex items-center gap-x-3 group cursor-pointer"
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

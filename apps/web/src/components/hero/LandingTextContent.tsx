'use client';
import { JSX, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { CroppedButton } from '../ui/cropped-button';
import { RandomRevealText } from '../ui/random-reveal-text';
import { FaArrowRight } from 'react-icons/fa';
import LandingDummyEvent from './LandingDummyEvent';
import { cn } from '@/lib/utils';
import { Doto } from 'next/font/google';
import { APP_NAME } from '@/utils/constants';

export const doto = Doto({
    subsets: ['latin'],
    weight: ['400', '500', '700', '800', '900'],
});

export default function LandingTextContent(): JSX.Element {
    const section_ref = useRef<HTMLElement>(null);

    const { scrollYProgress } = useScroll({
        target: section_ref,
        offset: ['start end', 'start start'],
    });

    const heading_y = useTransform(scrollYProgress, [0, 1], [60, 0]);
    const image_y = useTransform(scrollYProgress, [0, 1], [150, 0]);
    const image_scale = useTransform(scrollYProgress, [0, 1], [1.25, 1]);

    return (
        <main
            ref={section_ref}
            className="relative z-20 w-screen min-h-[110vh] bg-[#ff4000] overflow-hidden"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.22)_0.5px,transparent_1px)] bg-size-[8px_8px]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-[#ff4000] to-transparent"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-[#ff4000] to-transparent"
            />

            <div className="relative z-10">
                <div className="mx-auto max-w-6xl px-6 pt-28">
                    <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.25em] text-black/70">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-black animate-pulse" />
                        <span>Live on Arcium · Encrypted execution</span>
                    </div>
                    <motion.h1
                        style={{ y: heading_y }}
                        className={cn(
                            'mt-6 max-w-5xl text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-black leading-[0.95]',
                            doto.className,
                        )}
                    >
                        Explore the first application live on Arcium.
                    </motion.h1>
                </div>

                <motion.section
                    style={{ y: image_y, scale: image_scale }}
                    className="relative z-30 w-full max-w-6xl mx-auto px-4 mt-20"
                >
                    <LandingDummyEvent />
                </motion.section>

                <div className="mx-auto w-full max-w-6xl px-6 pt-28 pb-28">
                    <div className="flex flex-col items-center text-center gap-6">
                        <span className="text-xs font-mono uppercase tracking-[0.3em] text-black/60">
                            Now in private beta
                        </span>
                        <h2
                            className={cn(
                                'text-[18vw] md:text-[14vw] lg:text-[12rem] font-black tracking-tighter text-black leading-[0.85]',
                                doto.className,
                            )}
                        >
                            {APP_NAME}
                        </h2>
                        <p className="text-2xl md:text-3xl lg:text-4xl text-black/80 max-w-2xl tracking-tight font-medium">
                            <RandomRevealText text="Incognito mode for Solana." />
                        </p>
                        <CroppedButton size={'lg'} className="bg-black text-white mt-6">
                            <span>Start trading</span>
                            <FaArrowRight />
                        </CroppedButton>
                    </div>
                </div>
            </div>
        </main>
    );
}

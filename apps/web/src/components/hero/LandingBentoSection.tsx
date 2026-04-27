'use client';

import { useState, useRef, useCallback, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion';
import { FEATURES, ease } from './spotlight/data';
import SpotlightPanel from './spotlight/SpotlightPanel';
import FeatureNav from './spotlight/FeatureNav';

const sectionVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
    visible: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.7, ease },
    },
};

const bodyVariants = {
    hidden: { opacity: 0, y: 30, filter: 'blur(10px)' },
    visible: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.8, ease },
    },
};

export default function LandingBentoSection(): JSX.Element {
    const [active, setActive] = useState(0);
    const sectionRef = useRef<HTMLElement>(null);

    const glowX = useMotionValue(-1000);
    const glowY = useMotionValue(-1000);

    const handleSectionMouseMove = useCallback(
        (e: ReactMouseEvent) => {
            const rect = sectionRef.current?.getBoundingClientRect();
            if (!rect) return;
            glowX.set(e.clientX - rect.left);
            glowY.set(e.clientY - rect.top);
        },
        [glowX, glowY],
    );

    const handleSectionMouseLeave = useCallback(() => {
        glowX.set(-1000);
        glowY.set(-1000);
    }, [glowX, glowY]);

    const sectionGlow = useMotionTemplate`radial-gradient(900px circle at ${glowX}px ${glowY}px, rgba(0, 26, 255, 0.02), transparent 60%)`;

    return (
        <motion.section
            ref={sectionRef}
            onMouseMove={handleSectionMouseMove}
            onMouseLeave={handleSectionMouseLeave}
            className="relative min-h-screen w-screen bg-neutral-950 px-6 pt-40 pb-24"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            variants={sectionVariants}
        >
            <motion.div
                className="pointer-events-none absolute inset-0 z-0"
                style={{ background: sectionGlow }}
            />

            <div className="relative z-10 mx-auto flex max-w-[90vw] flex-col items-center">
                <motion.span
                    className="mb-4 block text-[11px] font-medium uppercase tracking-[0.2em] text-alpha"
                    variants={fadeUp}
                >
                    Why SolMarket
                </motion.span>

                <motion.h2
                    className="max-w-2xl text-center text-[2.7rem] leading-none font-medium"
                    variants={fadeUp}
                >
                    Unlock a Whole New Era of Prediction Markets
                </motion.h2>

                <motion.p
                    className="mt-4 max-w-lg text-center text-base text-neutral-600"
                    variants={fadeUp}
                >
                    Built on Solana for speed, transparency, and scale - everything prediction
                    markets should be.
                </motion.p>
            </div>

            <motion.div
                className="relative z-10 mx-auto mt-16 flex w-full max-w-[90vw] flex-col gap-3 md:flex-row"
                variants={bodyVariants}
            >
                <FeatureNav active={active} onSelect={setActive} />
                <SpotlightPanel feature={FEATURES[active]!} index={active} />
            </motion.div>
        </motion.section>
    );
}

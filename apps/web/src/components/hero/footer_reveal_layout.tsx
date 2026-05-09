'use client';

import { useEffect, useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import LandingFooter from '@/components/hero/LandingFooter';

export default function FooterReveal() {
    const footer_ref = useRef<HTMLDivElement>(null);
    const spacer_ref = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: spacer_ref,
        offset: ['start end', 'end end'],
    });
    const overlay_opacity = useTransform(scrollYProgress, [0, 1], [1, 0]);

    useEffect(() => {
        const footer_el = footer_ref.current;
        if (!footer_el) return;
        const update_height = () => {
            document.documentElement.style.setProperty(
                '--footer-reveal-height',
                `${footer_el.offsetHeight}px`,
            );
        };
        update_height();
        const ro = new ResizeObserver(update_height);
        ro.observe(footer_el);
        return () => {
            ro.disconnect();
            document.documentElement.style.removeProperty('--footer-reveal-height');
        };
    }, []);

    return (
        <>
            <div
                ref={spacer_ref}
                aria-hidden
                className="w-full"
                style={{ height: 'var(--footer-reveal-height, 0px)' }}
            />
            <div ref={footer_ref} className="fixed inset-x-0 bottom-0 z-0">
                <LandingFooter />
                <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-dark-alpha"
                    style={{ opacity: overlay_opacity }}
                />
            </div>
        </>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useLenis } from 'lenis/react';
import { AnimatePresence, motion } from 'motion/react';
import { PiArrowUp, PiArrowUpFill } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SHOW_AFTER_PX = 400;

const wrapper_variants = {
    hidden: { opacity: 0, y: 16, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1 },
};

const icon_lift_variants = {
    rest: { y: 0 },
    hover: { y: -2 },
};

const outline_variants = {
    rest: { opacity: 1, scale: 1 },
    hover: { opacity: 0, scale: 0.85 },
};

const fill_variants = {
    rest: { opacity: 0, scale: 0.85 },
    hover: { opacity: 1, scale: 1 },
};

export default function ScrollToTop() {
    const lenis = useLenis();
    const [visible, set_visible] = useState(false);

    useEffect(() => {
        const on_scroll = () => set_visible(window.scrollY > SHOW_AFTER_PX);
        on_scroll();
        window.addEventListener('scroll', on_scroll, { passive: true });
        return () => window.removeEventListener('scroll', on_scroll);
    }, []);

    const handle_click = () => {
        if (lenis) {
            lenis.scrollTo(0, { duration: 1.2 });
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="scroll-to-top"
                    variants={wrapper_variants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed bottom-6 right-1/2 z-50"
                >
                    <motion.div
                        initial="rest"
                        animate="rest"
                        whileHover="hover"
                        whileTap={{ scale: 0.96 }}
                    >
                        <Button
                            onClick={handle_click}
                            aria-label="Scroll to top"
                            className={cn(
                                'h-9 gap-1.5 rounded-full px-4 text-xs font-medium',
                                'bg-dark-base/90 text-light-base backdrop-blur-md',
                                'border border-light-base/10 shadow-lg shadow-black/30',
                                'hover:bg-dark-base hover:border-primary/40 hover:shadow-primary/10',
                            )}
                        >
                            <motion.span
                                variants={icon_lift_variants}
                                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                                className="relative inline-flex size-3.5"
                            >
                                <motion.span
                                    variants={outline_variants}
                                    transition={{ duration: 0.18 }}
                                    className="absolute inset-0 inline-flex"
                                >
                                    <PiArrowUp className="size-3.5" />
                                </motion.span>
                                <motion.span
                                    variants={fill_variants}
                                    transition={{ duration: 0.18 }}
                                    className="absolute inset-0 inline-flex"
                                >
                                    <PiArrowUpFill className="size-3.5" />
                                </motion.span>
                            </motion.span>
                            <span>back to top</span>
                        </Button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

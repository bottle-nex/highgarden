'use client';
import { JSX, useMemo, useRef } from 'react';
import { motion, useInView } from 'motion/react';

interface RandomRevealTextProps {
    text: string;
    className?: string;
    char_stagger?: number;
    initial_y?: number;
    in_view_amount?: number;
    once?: boolean;
    spring?: { stiffness?: number; damping?: number; mass?: number };
}

export function RandomRevealText({
    text,
    className,
    char_stagger = 0.02,
    initial_y = 18,
    in_view_amount = 0.5,
    once = false,
    spring,
}: RandomRevealTextProps): JSX.Element {
    const container_ref = useRef<HTMLSpanElement>(null);
    const in_view = useInView(container_ref, { amount: in_view_amount, once });

    const chars = useMemo(() => [...text], [text]);

    const delays = useMemo(() => {
        const n = chars.length;
        if (n === 0) return [] as number[];
        const prime = n % 13 === 0 ? 11 : 13;
        return chars.map((_, i) => ((i * prime) % n) * char_stagger);
    }, [chars, char_stagger]);

    const stiffness = spring?.stiffness ?? 320;
    const damping = spring?.damping ?? 22;
    const mass = spring?.mass ?? 0.5;

    return (
        <span ref={container_ref} className={className} aria-label={text}>
            {chars.map((char, i) => (
                <motion.span
                    key={i}
                    aria-hidden
                    className="inline-block"
                    initial={{ y: initial_y, opacity: 0 }}
                    animate={in_view ? { y: 0, opacity: 1 } : { y: initial_y, opacity: 0 }}
                    transition={{
                        delay: delays[i],
                        type: 'spring',
                        stiffness,
                        damping,
                        mass,
                        opacity: { duration: 0.25, ease: 'easeOut', delay: delays[i] },
                    }}
                >
                    {char === ' ' ? ' ' : char}
                </motion.span>
            ))}
        </span>
    );
}

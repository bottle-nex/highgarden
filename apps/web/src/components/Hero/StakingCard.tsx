'use client';
import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useAnimationFrame } from 'framer-motion';

const ITEMS = [
    { id: 1, initial: '$10' },
    { id: 2, initial: '$10' },
    { id: 3, initial: '$10' },
    { id: 4, initial: '$10' },
    { id: 5, initial: '$10' },
];

export default function StakingCard() {
    const x = useMotionValue(-800);
    const containerRef = useRef<HTMLDivElement>(null);

    useAnimationFrame(() => {
        const currentX = x.get();
        x.set(currentX + 0.6);

        if (currentX > 200) {
            x.set(-800);
        }
    });

    return (
        <div className="h-full flex items-center justify-center">
            <div className="relative w-full h-full overflow-hidden flex flex-col shadow-2xl">
                <div
                    className="relative flex-1 flex items-center justify-center overflow-hidden"
                    ref={containerRef}
                >
                    <div
                        className="absolute inset-0 z-0"
                        style={{
                            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 0.5px)`,
                            backgroundSize: '12px 12px',
                            maskImage: 'radial-gradient(circle at center, black, transparent 85%)',
                        }}
                    />

                    <motion.div
                        style={{ x }}
                        className="flex items-center gap-14 whitespace-nowrap z-10"
                    >
                        {[...ITEMS, ...ITEMS, ...ITEMS].map((item, index) => (
                            <TransformingItem
                                key={`${item.id}-${index}`}
                                item={item}
                                parentRef={containerRef}
                            />
                        ))}
                    </motion.div>

                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30">
                        <div className="w-20 h-20 bg-dark-alpha border border-white/10 flex items-center justify-center shadow-[0_0_60px_rgba(0,0,0,0.9)] relative">
                            <div className="w-10 h-10 text-alpha drop-shadow-[0_0_10px_rgba(38,211,103,0.1)]">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                >
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TransformingItem({
    item,
    parentRef,
}: {
    item: (typeof ITEMS)[0];
    parentRef: React.RefObject<HTMLDivElement | null>;
}) {
    const itemRef = useRef<HTMLDivElement>(null);
    const [isTransformed, setIsTransformed] = useState(false);
    const [visuals, setVisuals] = useState({ scale: 0.7, opacity: 0.1 });
    const [profitValue] = useState(() => (Math.random() * 60 + 15).toFixed(0));

    useAnimationFrame(() => {
        if (!itemRef.current || !parentRef.current) return;

        const parentRect = parentRef.current.getBoundingClientRect();
        const itemRect = itemRef.current.getBoundingClientRect();

        const parentCenter = parentRect.left + parentRect.width / 2;
        const itemCenter = itemRect.left + itemRect.width / 2;
        const distance = itemCenter - parentCenter;

        if (distance > 10 && !isTransformed) {
            setIsTransformed(true);
        } else if (distance < -10 && isTransformed) {
            setIsTransformed(false);
        }

        const absDist = Math.abs(distance);
        const proximity = Math.max(0, 1 - absDist / 180);

        setVisuals({
            scale: 0.65 + proximity * 0.5,
            opacity: 0.09 + proximity * 0.95,
        });
    });

    return (
        <motion.div
            ref={itemRef}
            style={{
                scale: visuals.scale,
                opacity: visuals.opacity,
            }}
            className={`
                shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-[14px] font-bold border-2 transition-all duration-500 ease-out
                ${
                    isTransformed
                        ? 'border-[#26d367] text-[#26d367] bg-[#001006] shadow-[0_0_20px_rgba(38,211,103,0.15)]'
                        : 'border-white/10 text-white/30 bg-dark-alpha'
                }
            `}
        >
            {isTransformed ? `+$${profitValue}` : item.initial}
        </motion.div>
    );
}

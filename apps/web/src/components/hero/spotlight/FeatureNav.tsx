'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FEATURES, ease } from './data';

export default function FeatureNav({
    active,
    onSelect,
}: {
    active: number;
    onSelect: (i: number) => void;
}) {
    return (
        <div className="flex w-full shrink-0 flex-row gap-1 overflow-x-auto md:w-[300px] md:flex-col md:overflow-visible">
            {FEATURES.map((feature, i) => {
                const isActive = active === i;
                return (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onSelect(i)}
                        className={cn(
                            'relative flex min-w-[200px] cursor-pointer items-start gap-4 rounded-[3px] p-5 text-left transition-all duration-300 md:min-w-0',
                            isActive ? 'bg-white/[0.03]' : 'bg-transparent hover:bg-white/[0.015]',
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="featureIndicator"
                                className="absolute bottom-2 left-2 right-2 h-[2px] rounded-full bg-alpha shadow-[0_0_12px_rgba(0,64,255,0.4)] md:bottom-auto md:left-0 md:right-auto md:top-3 md:h-[calc(100%-24px)] md:w-[2px]"
                                transition={{
                                    type: 'spring',
                                    bounce: 0.15,
                                    duration: 0.5,
                                }}
                            />
                        )}

                        <span
                            className={cn(
                                'mt-0.5 hidden font-mono text-xs transition-colors duration-300 md:block',
                                isActive ? 'text-alpha' : 'text-neutral-800',
                            )}
                        >
                            0{i + 1}
                        </span>

                        <div className="flex-1">
                            <div className="flex items-center gap-2.5">
                                <div
                                    className={cn(
                                        'transition-colors duration-300',
                                        isActive ? 'text-alpha' : 'text-neutral-600',
                                    )}
                                >
                                    {feature.icon}
                                </div>
                                <span
                                    className={cn(
                                        'text-sm font-medium transition-colors duration-300',
                                        isActive ? 'text-white' : 'text-neutral-500',
                                    )}
                                >
                                    {feature.label}
                                </span>
                            </div>

                            <AnimatePresence initial={false}>
                                {isActive && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{
                                            opacity: 1,
                                            height: 'auto',
                                        }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3, ease }}
                                        className="mt-2 hidden overflow-hidden text-[13px] leading-relaxed text-neutral-600 md:block"
                                    >
                                        {feature.description}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { Feature } from './types';
import { STREAM_LINES, ease } from './data';

export default function SpotlightPanel({ feature, index }: { feature: Feature; index: number }) {
    return (
        <div className="relative flex-1 overflow-hidden rounded-[3px] border border-white/6 bg-dark-alpha">
            <div
                className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
                style={{
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                }}
            />

            <motion.div
                className="pointer-events-none absolute z-0 h-80 w-80 rounded-full blur-[120px]"
                animate={{
                    background: feature.accent,
                    top: index < 2 ? '15%' : '30%',
                    right: index % 2 === 0 ? '5%' : '15%',
                }}
                transition={{ duration: 0.9, ease: 'easeInOut' }}
            />

            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                {STREAM_LINES.map((line, i) => (
                    <motion.div
                        key={i}
                        className="absolute right-0 h-px origin-right"
                        style={{
                            top: `${line.top}%`,
                            background: `linear-gradient(270deg, ${feature.accent.replace('0.5', '0.25')}, transparent)`,
                        }}
                        animate={{
                            width: [`${line.w1}%`, `${line.w2}%`, `${line.w3}%`],
                            opacity: [0.08, 0.25, 0.08],
                        }}
                        transition={{
                            duration: line.dur,
                            delay: i * 0.25,
                            repeat: Infinity,
                            ease: 'easeInOut',
                        }}
                    />
                ))}
            </div>

            <motion.div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px"
                animate={{
                    background: `linear-gradient(90deg, transparent 10%, ${feature.accent.replace('0.5', '0.3')} 50%, transparent 90%)`,
                }}
                transition={{ duration: 0.8 }}
            />

            <div className="relative z-30 flex h-full min-h-[520px] flex-col justify-between p-10 md:p-14">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, filter: 'blur(6px)', y: 10 }}
                        animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                        exit={{ opacity: 0, filter: 'blur(4px)', y: -10 }}
                        transition={{ duration: 0.35, ease }}
                    >
                        <div className="flex items-center gap-3 text-[11px]">
                            <span className=" text-alpha/50">0{index + 1}</span>
                            <span className="uppercase tracking-[0.15em] text-neutral-600">
                                {feature.label}
                            </span>
                        </div>

                        <h3 className="mt-6 whitespace-pre-line text-[2.4rem] font-semibold leading-[1.1] tracking-tight text-white md:text-[2.8rem]">
                            {feature.title}
                        </h3>

                        <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-neutral-500">
                            {feature.description}
                        </p>

                        <div className="mt-10 flex gap-8">
                            {feature.stats.map((stat, si) => (
                                <motion.div
                                    key={si}
                                    className="flex flex-col"
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{
                                        delay: 0.2 + si * 0.08,
                                        duration: 0.4,
                                        ease,
                                    }}
                                >
                                    <span className="text-xl font-semibold text-white">
                                        {stat.value}
                                    </span>
                                    <span className="mt-1 text-[11px] uppercase tracking-wider text-neutral-600">
                                        {stat.label}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </AnimatePresence>

                <div className="mt-auto pt-8">
                    <div className="h-px w-full bg-white/[0.04]" />
                </div>
            </div>
        </div>
    );
}

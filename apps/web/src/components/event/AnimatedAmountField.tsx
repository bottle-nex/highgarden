'use client';
import { JSX } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export type InputMode = 'USDC' | 'SHARES';

interface Props {
    input_mode: InputMode;
    amount: string;
    computed_shares: number;
    computed_usd: number;
    focused: boolean;
    on_change: (next: string) => void;
    on_toggle_mode: () => void;
    on_focus: () => void;
    on_blur: () => void;
}

export default function AnimatedAmountField({
    input_mode,
    amount,
    computed_shares,
    computed_usd,
    focused,
    on_change,
    on_toggle_mode,
    on_focus,
    on_blur,
}: Props): JSX.Element {
    return (
        <div className="rounded-lg bg-white/2.5 px-4 py-3.5">
            <div className="flex items-center justify-between mb-0.5">
                <button
                    type="button"
                    onClick={on_toggle_mode}
                    className="text-[12px] font-medium text-white/55 hover:text-white/85 cursor-pointer transition-colors"
                    title="Switch input units"
                >
                    Amount ({input_mode === 'USDC' ? 'USDC' : 'Shares'})
                </button>
                <span className="text-[11px] font-medium text-white/35 tabular-nums">
                    {input_mode === 'USDC'
                        ? `≈ ${computed_shares} shares`
                        : `≈ $${computed_usd.toFixed(2)}`}
                </span>
            </div>
            <div className="flex items-center gap-1">
                <span
                    className={`text-2xl sm:text-3xl font-bold leading-none transition-colors ${
                        amount ? 'text-white' : 'text-white/40'
                    }`}
                >
                    {input_mode === 'USDC' ? '$' : '#'}
                </span>
                <div className="relative flex-1 min-w-0 h-10">
                    <input
                        type="number"
                        inputMode={input_mode === 'USDC' ? 'decimal' : 'numeric'}
                        min={0}
                        step={input_mode === 'USDC' ? '0.01' : '1'}
                        placeholder="0"
                        value={amount}
                        onChange={(e) => on_change(e.target.value)}
                        onFocus={on_focus}
                        onBlur={on_blur}
                        className="absolute inset-0 w-full bg-transparent outline-none text-2xl sm:text-3xl font-bold tabular-nums text-transparent caret-transparent placeholder:text-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <div
                        className={`absolute inset-0 flex items-center pointer-events-none text-2xl sm:text-3xl font-bold tabular-nums ${
                            amount ? 'text-white' : 'text-white/20'
                        }`}
                    >
                        {(amount || '0').split('').map((char, idx) => (
                            <span
                                key={idx}
                                className="relative inline-flex justify-center overflow-hidden"
                                style={{ width: char === '.' ? '0.35em' : '0.6em' }}
                            >
                                <AnimatePresence mode="popLayout" initial={false}>
                                    <motion.span
                                        key={char}
                                        initial={{ y: '70%', opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: '-70%', opacity: 0 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 500,
                                            damping: 38,
                                        }}
                                        className="inline-block"
                                    >
                                        {char}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        ))}
                        {focused && (
                            <motion.span
                                aria-hidden
                                animate={{ opacity: [1, 1, 0, 0] }}
                                transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    ease: 'linear',
                                    times: [0, 0.5, 0.5, 1],
                                }}
                                className="ml-0.5 inline-block w-0.5 h-7 bg-white"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

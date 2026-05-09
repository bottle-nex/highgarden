'use client';

import { JSX, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PiPlus, PiArrowUpRight } from 'react-icons/pi';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { doto } from '../hero/LandingTextContent';
import { APP_NAME } from '@/utils/constants';

type FaqItem = { id: string; question: string; answer: string };

const FAQS: FaqItem[] = [
    {
        id: 'what',
        question: `What is ${APP_NAME}?`,
        answer: `${APP_NAME} is a Solana-native prediction market. You trade YES/NO outcomes on real-world events, settled in USDC on Solana, with the speed and fees the chain was designed for.`,
    },
    {
        id: 'wallet',
        question: 'Do I need a Solana wallet to trade?',
        answer: `Yes. Connect any wallet that supports the Wallet Standard — Phantom, Solflare, Backpack, etc. ${APP_NAME} is non-custodial: every transaction is signed by you, and your keys never leave your wallet.`,
    },
    {
        id: 'resolution',
        question: 'How are markets resolved?',
        answer: 'Each market lists its YES condition, NO condition, and the source of truth before any trade is placed. Once that source confirms the outcome, settlement runs on-chain through the protocol — no manual approvals between resolution and payout.',
    },
    {
        id: 'fees',
        question: 'What fees do I pay?',
        answer: `You pay the underlying Solana network fee (gas) in SOL when you sign a transaction. ${APP_NAME} may charge a small protocol fee on filled orders or settlement payouts; the current schedule is published in-app.`,
    },
    {
        id: 'rules',
        question: 'Where are the rules for a market documented?',
        answer: 'On the market page itself. Every market has a public rule set that is visible before you trade and is immutable for the lifetime of the market — what you read at entry is exactly what is used at resolution.',
    },
    {
        id: 'jurisdictions',
        question: `Is ${APP_NAME} available everywhere?`,
        answer: 'No. Some jurisdictions restrict or prohibit prediction markets. The current list of restricted regions is maintained in the Terms of Service — check there before trading.',
    },
];

type Props = {
    index?: number;
};

export default function AppFaq({ index }: Props): JSX.Element {
    const [open_id, set_open_id] = useState<string | null>(FAQS[0]?.id ?? null);
    const number = index !== undefined ? String(index).padStart(2, '0') : null;

    function toggle(id: string) {
        set_open_id((curr) => (curr === id ? null : id));
    }

    return (
        <motion.section
            id="faq"
            className="scroll-mt-28 border-t border-white/10 py-10 sm:py-12 lg:py-16 bg-dark-alpha"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
            <div className="grid grid-cols-1 gap-x-8 gap-y-8 sm:gap-x-12 sm:gap-y-12 lg:grid-cols-[3fr_7fr] lg:gap-x-20">
                <div className="lg:sticky lg:top-28 lg:self-start">
                    <div className="mb-5 flex items-center gap-x-3">
                        {number ? (
                            <>
                                <span className="text-[10px] tabular-nums tracking-[0.25em] text-alpha/80">
                                    {number}
                                </span>
                                <span className="h-px w-6 bg-white/20" />
                            </>
                        ) : (
                            <span className="h-px w-6 bg-white/30" />
                        )}
                        <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                            FAQ
                        </span>
                    </div>

                    <h2
                        className={cn(
                            'text-4xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tighter text-white leading-[0.9]',
                            doto.className,
                        )}
                    >
                        FAQ.
                    </h2>

                    <p className="mt-6 max-w-md text-[14px] leading-[1.75] text-white/55">
                        The short version of how {APP_NAME} works — wallets, settlement, fees, and
                        the rules every market ships with. For anything not covered here, the Terms
                        of Service has the long form.
                    </p>

                    <a
                        href="mailto:hello@solmarket.xyz"
                        className="group/ask mt-8 inline-flex items-center gap-x-2 text-[10px] font-mono uppercase tracking-[0.25em] text-white/60 transition-colors duration-200 hover:text-alpha"
                    >
                        <span className="h-px w-4 bg-current" />
                        <span>Ask a question</span>
                        <PiArrowUpRight className="size-3 transition-transform duration-200 group-hover/ask:-translate-y-px group-hover/ask:translate-x-px" />
                    </a>
                </div>

                <ul className="border-t border-white/10">
                    {FAQS.map((faq) => {
                        const is_open = open_id === faq.id;
                        return (
                            <li key={faq.id} className="border-b border-white/10">
                                <Button
                                    variant="ghost"
                                    onClick={() => toggle(faq.id)}
                                    aria-expanded={is_open}
                                    aria-controls={`faq-panel-${faq.id}`}
                                    className={cn(
                                        'group/faq flex h-auto w-full items-center justify-between gap-x-3 sm:gap-x-6 rounded-none bg-transparent px-0 py-4 sm:py-6 text-left whitespace-normal',
                                        'hover:bg-transparent aria-expanded:bg-transparent',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex-1 pr-2 text-left text-base md:text-xl font-medium tracking-tight whitespace-normal transition-colors duration-200',
                                            is_open
                                                ? 'text-white'
                                                : 'text-white/85 group-hover/faq:text-white',
                                        )}
                                    >
                                        {faq.question}
                                    </span>
                                    <span
                                        className={cn(
                                            'flex size-7 shrink-0 items-center justify-center text-alpha transition-all duration-300',
                                            is_open ? 'rotate-45' : 'border-white/15',
                                        )}
                                        aria-hidden
                                    >
                                        <PiPlus className="size-3.5" />
                                    </span>
                                </Button>

                                <AnimatePresence initial={false}>
                                    {is_open ? (
                                        <motion.div
                                            id={`faq-panel-${faq.id}`}
                                            key="content"
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{
                                                duration: 0.4,
                                                ease: [0.25, 0.1, 0.25, 1],
                                            }}
                                            className="overflow-hidden"
                                        >
                                            <p className="max-w-2xl pb-4 sm:pb-6 text-[14px] sm:text-[16px] leading-[1.75] text-white/65">
                                                {faq.answer}
                                            </p>
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </motion.section>
    );
}

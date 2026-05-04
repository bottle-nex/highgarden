'use client';

import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { CATEGORY_TABS } from '@/utils/constants';
import { useCategoryStore, type Category } from '@/store/ui/useCategoryStore';

interface Props {
    description: string;
    tags: string[];
}

const TABS = ['RULES', 'MARKET CONTEXT', 'MARKET TAGS'] as const;
type Tab = (typeof TABS)[number];

const COLLAPSED_LINES = 10;
// Apple/Linear-style ease-out; quick at the start, soft landing.
const HEIGHT_EASE = [0.32, 0.72, 0, 1] as const;

/** Match a tag string to a sidebar category, case-insensitively. Returns
 *  `null` when the tag doesn't correspond to a category in the sidebar. */
function tag_to_category(tag: string): Category | null {
    const target = tag.trim().toLowerCase();
    if (!target) return null;
    return CATEGORY_TABS.find((c) => c.toLowerCase() === target) ?? null;
}

export default function EventTabs({ description, tags }: Props): JSX.Element {
    const router = useRouter();
    const setActiveCategory = useCategoryStore((s) => s.setActiveCategory);

    const [active, set_active] = useState<Tab>('RULES');
    const [expanded, set_expanded] = useState<boolean>(false);
    const [has_overflow, set_has_overflow] = useState<boolean>(false);

    const panel_ref = useRef<HTMLDivElement>(null);
    const text_ref = useRef<HTMLDivElement>(null);
    const [panel_height, set_panel_height] = useState<number | null>(null);

    const handle_tab_click = (next: Tab) => {
        // Collapse the description when leaving the MARKET CONTEXT tab so
        // coming back starts truncated again.
        if (next !== 'MARKET CONTEXT') set_expanded(false);
        set_active(next);
    };

    // Detect whether the description is actually clipped — only meaningful
    // while the line-clamp is active. Once we know it overflows, keep the
    // "Show more" affordance visible (so the user can collapse again after
    // expanding).
    useEffect(() => {
        if (active !== 'MARKET CONTEXT' || expanded) return;
        const el = text_ref.current;
        if (!el) return;
        const check = () => set_has_overflow(el.scrollHeight - el.clientHeight > 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [description, active, expanded]);

    // Measure the panel's natural height and let framer-motion animate the
    // wrapper to it. useLayoutEffect runs synchronously before paint, so the
    // first render never flashes a 0-height panel.
    useLayoutEffect(() => {
        const el = panel_ref.current;
        if (!el) return;
        const update = () => set_panel_height(el.getBoundingClientRect().height);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const handle_tag_click = (tag: string) => {
        const category = tag_to_category(tag);
        if (category) setActiveCategory(category);
        router.push('/dashboard');
    };

    return (
        <section className="">
            <header className="flex items-center gap-6 px-5 pt-5 border-b border-white/8">
                {TABS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => handle_tab_click(t)}
                        className={`pb-3  text-[10px] tracking-[0.2em] uppercase border-b-2 transition-colors cursor-pointer ${
                            active === t
                                ? 'border-blue-500/80 text-white'
                                : 'border-transparent text-white/40 hover:text-white/70'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </header>

            <motion.div
                initial={false}
                animate={panel_height !== null ? { height: panel_height } : undefined}
                transition={{ duration: 0.32, ease: HEIGHT_EASE }}
                className="overflow-hidden"
            >
                <div ref={panel_ref} className="px-5 py-5 text-sm text-white/65 leading-relaxed">
                    {active === 'MARKET CONTEXT' ? (
                        description ? (
                            <>
                                <div
                                    ref={text_ref}
                                    className="whitespace-pre-line"
                                    style={
                                        expanded
                                            ? undefined
                                            : {
                                                  display: '-webkit-box',
                                                  WebkitBoxOrient: 'vertical',
                                                  WebkitLineClamp: COLLAPSED_LINES,
                                                  overflow: 'hidden',
                                              }
                                    }
                                >
                                    {description}
                                </div>
                                {(has_overflow || expanded) && (
                                    <button
                                        type="button"
                                        onClick={() => set_expanded((v) => !v)}
                                        className="mt-3 text-[12px] tracking-tight text-neutral-300 hover:text-neutral-200 transition-colors cursor-pointer font-semibold hover:underline"
                                    >
                                        {expanded ? 'show less' : 'show more'}
                                    </button>
                                )}
                            </>
                        ) : (
                            <span className="text-white/35">No additional context provided.</span>
                        )
                    ) : active === 'MARKET TAGS' ? (
                        tags.length > 0 ? (
                            <ul className="flex flex-wrap items-center gap-2">
                                {tags.map((tag) => {
                                    const category = tag_to_category(tag);
                                    return (
                                        <li key={tag}>
                                            <button
                                                type="button"
                                                onClick={() => handle_tag_click(tag)}
                                                title={
                                                    category
                                                        ? `Browse ${category} markets`
                                                        : 'Browse markets'
                                                }
                                                className="px-2.5 py-1 rounded-sm border border-white/10 bg-dark-base text-[11px] tracking-wider text-white/70 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
                                            >
                                                {tag}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <span className="text-white/35">No tags for this market.</span>
                        )
                    ) : (
                        <span className="text-white/55">
                            Resolution rules from the source market apply. This market resolves to
                            YES if the underlying Polymarket question resolves YES, and NO
                            otherwise. Detailed structured rules will surface here as they&apos;re
                            indexed.
                        </span>
                    )}
                </div>
            </motion.div>
        </section>
    );
}

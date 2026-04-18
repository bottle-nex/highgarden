import { JSX } from 'react';
import type { HotTopic } from '@/utils/constants';
import SectionHeading from './SectionHeading';

export default function HotTopicsList({ topics }: { topics: HotTopic[] }): JSX.Element {
    return (
        <section>
            <SectionHeading title="HOT TOPICS" subtitle="24H" />
            <div className="border border-white/10 bg-neutral-950 rounded-[6px] overflow-hidden">
                {topics.map((topic) => (
                    <div
                        key={topic.id}
                        className="flex items-center gap-4 p-5 border-b border-white/8 last:border-b-0 hover:bg-white/3 transition-colors cursor-pointer group "
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-[15px] text-white/75 truncate">{topic.title}</p>
                            <div className="mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-white/40">
                                <span className="text-white/55">{topic.category}</span>
                                <span className="text-white/25">·</span>
                                <span>{topic.volume}</span>
                                <span className="text-white/25">·</span>
                                <span>{topic.traders.toLocaleString()} TRADERS</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

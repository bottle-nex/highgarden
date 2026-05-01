import { JSX } from 'react';
import type { HotTopic } from '@/utils/constants';
import SectionHeading from './SectionHeading';

export default function HotTopicsList({ topics }: { topics: HotTopic[] }): JSX.Element {
    return (
        <section className="flex flex-col min-h-0">
            <div className="px-2">
                <SectionHeading title="Hot Topics" subtitle="24H" />
            </div>
            <ul className="flex-1 min-h-0 overflow-hidden">
                {topics.map((topic, i) => (
                    <li
                        key={topic.id}
                        className="py-3 flex items-center gap-3 hover:bg-white/3 transition-colors cursor-pointer group px-2 rounded-sm"
                    >
                        <span className=" text-[15px] tabular-nums text-white/35 shrink-0">
                            {String(i + 1).padStart(2, '0')}
                        </span>
                        <p className="flex-1 min-w-0 text-[13px] text-white/70 leading-snug line-clamp-2 group-hover:text-white/85 transition-colors">
                            {topic.title}
                        </p>
                        <span className=" text-[11px] tabular-nums text-white/55 shrink-0">
                            {topic.volume}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

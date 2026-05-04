'use client';

import { JSX, ReactNode } from 'react';

import LegalHero from './LegalHero';
import LegalSection from './LegalSection';
import LegalTableOfContents, { TocItem } from './LegalTableOfContents';

export type LegalSectionInput = {
    id: string;
    title: string;
    eyebrow?: string;
    body: ReactNode;
};

type Props = {
    eyebrow: string;
    title: string;
    description?: string;
    effective_date: string;
    version: string;
    sections: LegalSectionInput[];
};

export default function LegalShell({
    eyebrow,
    title,
    description,
    effective_date,
    version,
    sections,
}: Props): JSX.Element {
    const toc_items: TocItem[] = sections.map((s) => ({ id: s.id, label: s.title }));

    return (
        <main className="relative w-full bg-neutral-950 pt-32 pb-32">
            <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
                <LegalHero
                    eyebrow={eyebrow}
                    title={title}
                    effective_date={effective_date}
                    version={version}
                    description={description}
                />

                <div className="mt-16 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[240px_1fr]">
                    <LegalTableOfContents items={toc_items} />

                    <div className="max-w-3xl space-y-16">
                        {sections.map((section, idx) => (
                            <LegalSection
                                key={section.id}
                                id={section.id}
                                index={idx + 1}
                                title={section.title}
                                eyebrow={section.eyebrow}
                            >
                                {section.body}
                            </LegalSection>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}

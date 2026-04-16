import type { JSX } from 'react';

export interface FeatureStat {
    value: string;
    label: string;
}

export interface Feature {
    label: string;
    title: string;
    description: string;
    stats: FeatureStat[];
    accent: string;
    accentGlow: string;
    icon: JSX.Element;
}

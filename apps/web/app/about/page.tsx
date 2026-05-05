import { JSX } from 'react';
import type { Metadata } from 'next';

import AboutShell from '@/components/about/AboutShell';
import { Engineer } from '@/components/about/EngineerCard';
import { APP_NAME } from '@/utils/constants';

export const metadata: Metadata = {
    title: 'About',
    description: `Meet the team building ${APP_NAME}, a Solana-native prediction market.`,
};

const engineers: Engineer[] = [
    {
        id: 'rishi',
        name: 'Rishi Kant',
        role: 'Financially broke engineer',
        image: '/images/founders/rishi.jpg',
        bio: 'Rishi sets the product direction and writes most of the front-of-house code you trade through. He cares about how a market feels — the click, the price, the seconds between signing and settlement.',
        socials: {
            x: 'https://x.com/khairrishi',
            linkedin: 'https://www.linkedin.com/in/kant-linked/',
            github: 'https://github.com/kant-github',
        },
    },
    {
        id: 'anjan',
        name: 'Anjan Suman',
        role: 'Wanna be engineer',
        image: '/images/founders/anjan.jpeg',
        bio: 'Anjan owns the order book and the resolution layer. If a price prints on the chart, his code put it there; if a market settles correctly, the same code did that too.',
        socials: {
            x: 'https://x.com/anjanstwt',
            linkedin: 'https://www.linkedin.com/in/anjanstwt/',
            github: 'https://github.com/anjanstwt',
        },
    },
    {
        id: 'piyush',
        name: 'Piyush Raj',
        role: 'Color changing engineer',
        image: '/images/founders/piyush.jpeg',
        bio: 'Piyush builds the Solana programs and the infrastructure underneath them. He treats latency, fees, and on-chain correctness as the same problem and refuses to ship anything that fails on any of the three.',
        socials: {
            x: 'https://x.com/PiyushC2P',
            linkedin: 'https://www.linkedin.com/in/piyush-rj/',
            github: 'https://github.com/piyush-rj',
        },
    },
];

export default function AboutPage(): JSX.Element {
    return <AboutShell engineers={engineers} />;
}

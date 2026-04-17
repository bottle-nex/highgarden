'use client';
import { JSX, use } from 'react';
import { notFound } from 'next/navigation';
import { getMarketBySlug } from '@/utils/constants';
import MarketDetailPage from '@/components/market/MarketDetailPage';

export default function MarketPage({ params }: { params: Promise<{ slug: string }> }): JSX.Element {
    const { slug } = use(params);
    const market = getMarketBySlug(slug);

    if (!market) {
        notFound();
    }

    return <MarketDetailPage market={market} />;
}

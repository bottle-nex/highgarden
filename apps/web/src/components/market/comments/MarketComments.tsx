'use client';
import { JSX } from 'react';
import NativeCommentsSection from './NativeCommentsSection';
import PolymarketCommentsSection from './PolymarketCommentsSection';

interface Props {
    market_id: string;
}

export default function MarketComments({ market_id }: Props): JSX.Element {
    return (
        <div>
            <NativeCommentsSection market_id={market_id} />
            <PolymarketCommentsSection market_id={market_id} />
        </div>
    );
}

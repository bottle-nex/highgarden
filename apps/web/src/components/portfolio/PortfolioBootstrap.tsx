'use client';
import { usePortfolioSync } from '@/hooks/usePortfolioSync';

export default function PortfolioBootstrap(): null {
    usePortfolioSync();
    return null;
}

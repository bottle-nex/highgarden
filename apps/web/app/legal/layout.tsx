import { JSX, ReactNode } from 'react';

import LandingFooter from '@/components/hero/LandingFooter';
import LandingNavbar from '@/components/navbar/LandingNavbar';

export default function LegalLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div className="flex min-h-screen w-full flex-col bg-neutral-950">
            <LandingNavbar />
            {children}
            <LandingFooter />
        </div>
    );
}

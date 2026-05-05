'use client';

import { ReactLenis } from 'lenis/react';

interface LenisProviderProps {
    children: React.ReactNode;
}

export default function LenisProvider({ children }: LenisProviderProps) {
    return (
        <ReactLenis
            root
            options={{
                lerp: 0.08,
                smoothWheel: true,
                wheelMultiplier: 0.9,
                touchMultiplier: 1.5,
                syncTouch: false,
                orientation: 'vertical',
                gestureOrientation: 'vertical',
                autoRaf: true,
            }}
        >
            {children}
        </ReactLenis>
    );
}

import { JSX } from 'react';
import CardHeader from './CardHeader';

export default function LiquidityCard(): JSX.Element {
    return (
        <div className="group relative flex h-150 flex-col overflow-hidden bg-neutral-950 p-10 transition-transform duration-300 ease-out">
            <CardHeader label="Liquidity & Interaction" context="Solana Context" />

            <div className="mt-5">
                <h3 className="text-[1.75rem] font-semibold leading-tight text-white">
                    Solana-Powered Liquidity &
                    <br />
                    Real-Time Interactions
                </h3>
                <p className="mt-3 text-sm text-neutral-400">
                    Lightning-fast updates, deep liquidity, dynamic parameter control.
                </p>
            </div>

            <div className="relative mt-4 flex flex-1 items-center justify-center">
                <ParticleSphere />
            </div>
        </div>
    );
}

function ParticleSphere(): JSX.Element {
    return (
        <div className="relative size-56">
            <div
                className="absolute inset-0 rounded-full mix-blend-screen"
                style={{
                    background:
                        'radial-gradient(circle at 60% 70%, rgba(255,80,180,0.6), transparent 55%), radial-gradient(circle at 30% 65%, rgba(80,160,255,0.5), transparent 55%)',
                }}
            />
            <div
                className="absolute inset-0 rounded-full opacity-60"
                style={{
                    backgroundImage:
                        'radial-gradient(rgba(255,255,255,0.8) 0.5px, transparent 1px)',
                    backgroundSize: '6px 6px',
                    maskImage: 'radial-gradient(circle, black 55%, transparent 75%)',
                    WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 75%)',
                }}
            />
        </div>
    );
}

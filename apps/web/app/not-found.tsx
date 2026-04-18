import Link from 'next/link';
import LandingNavbar from '@/components/navbar/LandingNavbar';
import { bitcountGridDouble } from '@/components/hero/LandingCtaSection';
import { EdgeArrows } from '@/components/hero/LandingFeatureCardsSection';
import { cn } from '@/lib/utils';

export default function NotFound() {
    return (
        <main className="min-h-screen w-screen bg-neutral-950 flex flex-col relative overflow-hidden">
            <LandingNavbar />

            <section className="relative z-10 flex-1 flex flex-col justify-between px-8 md:px-12 lg:px-16 pt-32 pb-10">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-alpha/80 mb-4">
                            ERROR · SIGNAL LOST
                        </div>
                        <div
                            className={cn(
                                'text-7xl md:text-8xl lg:text-9xl tracking-tighter text-white leading-none',
                                bitcountGridDouble.className,
                            )}
                        >
                            404
                        </div>
                        <div className="mt-2 font-mono text-[10px] md:text-xs tracking-[0.2em] uppercase text-white/35">
                            PAGE NOT FOUND
                        </div>
                    </div>

                    <div className="hidden md:flex flex-col items-end gap-y-4">
                        <div className="flex items-center gap-x-3 font-mono text-[10px] tracking-[0.2em] uppercase text-white/40">
                            <span>STATUS</span>
                            <span className="w-6 h-px bg-white/20" />
                            <span>OFF-CHAIN</span>
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30">
                            ROUTE / UNRESOLVED
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-16 gap-y-6 items-end">
                    <div className="max-w-2xl">
                        <div className="relative border-l border-white/10 pl-6">
                            <p className="text-sm md:text-[15px] leading-[1.7] text-white/70 font-light">
                                &ldquo;The page you&rsquo;re looking for has either been settled,
                                resolved, or never existed on this market. Every route on SolMarket
                                is verifiable &mdash; this one isn&rsquo;t.&rdquo;
                            </p>
                            <div className="mt-5 flex items-center gap-x-4">
                                <div className="w-5 h-px bg-white/20" />
                                <div>
                                    <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/90">
                                        SOLMARKET ROUTER
                                    </p>
                                    <p className="font-mono text-[10px] tracking-widest text-white/30 mt-0.5">
                                        EDGE NODE · MAINNET
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative shrink-0">
                        <Link
                            href="/"
                            className="relative block border border-white/10 hover:border-white/20 bg-white/3 backdrop-blur-sm px-8 py-5 group"
                        >
                            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-white/30 mb-3">
                                DEAD END
                            </div>
                            <div className="font-mono text-xs tracking-[0.2em] uppercase text-white group-hover:text-alpha transition-colors duration-300 flex items-center gap-x-3">
                                <span>RETURN HOME</span>
                                <span className="w-6 h-px bg-white/30 group-hover:bg-alpha group-hover:w-10 transition-all duration-300" />
                                <span className="text-white/30 group-hover:text-alpha transition-colors duration-300">
                                    &rarr;
                                </span>
                            </div>
                            <EdgeArrows borderColor="border-white/10 group-hover:border-white/20" />
                        </Link>
                    </div>
                </div>
            </section>
        </main>
    );
}

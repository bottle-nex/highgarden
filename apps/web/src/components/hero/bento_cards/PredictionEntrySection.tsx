'use client';
import Image from 'next/image';
import CardHeader from './CardHeader';

export default function PredictionEntrySection() {
    return (
        <div className="group relative flex h-150 flex-col overflow-hidden bg-black p-10 transition-transform duration-300 ease-out hover:-translate-y-0.5">
            <CardHeader label="Ultra-fast prediction engine" context="Solana Context" />
            <div className="mt-5">
                <h3 className="text-[1.75rem] font-semibold leading-tight text-white">
                    Built for real-time markets &
                    <br />
                    Engineered for instant outcomes
                </h3>
                <p className="mt-3 text-sm text-neutral-400">
                    Real-time data, instant settlements, and unmatched performance on-chain.
                </p>
            </div>

            <div className="relative mt-25 flex flex-col gap-y-4 flex-1 items-center justify-center text-[17px] tracking-wide">
                <div className="h-13 w-105 bg-linear-to-b from-[#16161A] via-[#16161A] to-[#16161A] rounded-sm inset-shadow-xs inset-shadow-white/5 flex justify-center items-center gap-x-1 shadow-xl shadow-black">
                    <div className="h-8 w-8 relative overflow-hidden">
                        <Image
                            src={'/images/assets/coins.png'}
                            alt=""
                            className="object-cover"
                            fill
                            unoptimized
                        />
                    </div>
                    Start Predicting
                </div>
                <div className="h-13 w-105 bg-linear-to-b from-[#16161A] via-[#16161A] to-[#16161A] rounded-sm inset-shadow-xs inset-shadow-white/5 flex justify-center items-center gap-x-1">
                    <div className="h-8 w-8 relative overflow-hidden">
                        <Image
                            src={'/images/assets/globe.png'}
                            alt=""
                            className="object-cover"
                            fill
                            unoptimized
                        />
                    </div>
                    Explore Markets
                </div>
                <div className="h-13 w-105 bg-linear-to-b from-[#16161A] via-[#16161A] to-[#16161A] rounded-sm inset-shadow-xs inset-shadow-white/5 flex justify-center items-center gap-x-1">
                    <div className="h-8 w-8 relative overflow-hidden">
                        <Image
                            src={'/images/assets/gold.png'}
                            alt=""
                            className="object-cover"
                            fill
                            unoptimized
                        />
                    </div>
                    Launch a Market
                </div>

                <div className="h-30 w-105 bg-linear-to-b from-[#16161A] via-[#16161A] to-transparent rounded-sm inset-shadow-xs inset-shadow-white/5 flex justify-center items-start gap-x-1 py-3">
                    <div className="flex items-center gap-x-1">
                        <div className="h-8 w-8 relative overflow-hidden">
                            <Image
                                src={'/images/assets/building.png'}
                                alt=""
                                className="object-cover"
                                fill
                                unoptimized
                            />
                        </div>
                        View Live Markets
                    </div>
                </div>
            </div>
        </div>
    );
}

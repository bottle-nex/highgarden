'use client';
import Image from 'next/image';
import { Roboto_Condensed } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { IoIosArrowForward } from 'react-icons/io';

export const robotoCondensed = Roboto_Condensed({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700', '800'],
    display: 'swap',
});

export default function LandingHeroSection() {
    return (
        <div className="h-screen w-screen relative">
            <Image
                src={'/images/landing/hero.png'}
                alt="hero-img"
                className="object-cover"
                fill
                unoptimized
            />

            <div
                className={cn(
                    'h-full w-full relative z-10 flex flex-col space-y-0 items-center pt-[10%] text-center text-white',
                    robotoCondensed.className,
                )}
            >
                <div className="text-light-base tracking-widest text-xl font-light">
                    SOLMARKET IS
                </div>

                <div className="text-[7rem] font-bold leading-none tracking-tighter uppercase md:text-[9rem]">
                    POLYMARKET
                </div>

                <div className="text-[5rem] font-light font-serif leading-none opacity-90">ON</div>

                <div className="text-[7rem] font-bold leading-none tracking-tighter uppercase md:text-[9rem]">
                    SOLANA
                </div>

                <div className="mt-8">FIRST SOL DEDICATED PREDICTION MARKET</div>
                <div className="flex gap-x-2 mt-5">
                    <Button
                        className={cn(
                            'text-[18px] h-11 w-fit px-5 rounded-full bg-light-base hover:bg-light-base text-dark-base font-normal cursor-pointer border-px border-black/10 shadow-md shadow-black/10 inset-shadow-xs inset-shadow-black/10',
                        )}
                    >
                        Start Playing
                    </Button>

                    <Button
                        className={cn(
                            'text-[18px] h-11 w-fit px-5 rounded-full bg-alpha hover:bg-alpha text-light-base font-normal cursor-pointer flex items-center gap-x-1 group shadow-md shadow-white/10 border-px border-black/10 inset-shadow-xs inset-shadow-white/10',
                        )}
                    >
                        Know more
                        <IoIosArrowForward className="size-4 group-hover:translate-x-0.5 transition-all transform duration-200" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

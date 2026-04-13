'use client';
import { MdArrowOutward } from 'react-icons/md';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';

export default function LandingFooter() {
    return (
        <div className="h-100 w-screen bg-[#0A0A0A] mt-20 flex flex-col justify-between p-8">
            <div className="flex justify-between">
                <div className="flex flex-col gap-y-4 shrink-0">
                    <div className="text-2xl max-w-md">
                        Engineered to make future outcomes transparent, tradable, and verifiable.
                    </div>

                    <Button
                        className={cn(
                            'bg-white hover:bg-white text-dark-alpha rounded-none',
                            'w-fit text-base h-10 px-4!',
                        )}
                    >
                        Start Predicting
                    </Button>
                </div>

                <div className="h-full flex justify-end gap-x-20">
                    <div className="flex flex-col gap-y-3">
                        <div className="text-[12px] text-light-base/50 uppercase tracking-wider">
                            Markets
                        </div>
                        <div className="flex flex-col gap-y-2 text-[13px] text-light-base/80">
                            <p className="cursor-pointer hover:text-light-base">Explore</p>
                            <p className="cursor-pointer hover:text-light-base">Politics</p>
                            <p className="cursor-pointer hover:text-light-base">Crypto</p>
                            <p className="cursor-pointer hover:text-light-base">Sports</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-y-3">
                        <div className="text-[12px] text-light-base/50 uppercase tracking-wider">
                            Trade
                        </div>
                        <div className="flex flex-col gap-y-2 text-[13px] text-light-base/80">
                            <p className="cursor-pointer hover:text-light-base">Portfolio</p>
                            <p className="cursor-pointer hover:text-light-base">Leaderboard</p>
                            <p className="cursor-pointer hover:text-light-base">Rewards</p>
                            <p className="cursor-pointer hover:text-light-base">Activity</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-y-3">
                        <div className="text-[12px] text-light-base/50 uppercase tracking-wider">
                            Resources
                        </div>
                        <div className="flex flex-col gap-y-2 text-[13px] text-light-base/80">
                            <p className="cursor-pointer hover:text-light-base">Docs</p>
                            <p className="cursor-pointer hover:text-light-base">How it Works</p>
                            <p className="cursor-pointer hover:text-light-base">FAQ</p>
                            <p className="cursor-pointer hover:text-light-base">Support</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between text-[13px] text-light-base/80">
                <div className="flex gap-x-8">
                    <div className="cursor-pointer flex items-center gap-x-0.5 group">
                        Twitter
                        <MdArrowOutward className="opacity-0 group-hover:opacity-100 transition-all transform duration-250 text-light-base/60" />
                    </div>
                    <div className="cursor-pointer flex items-center gap-x-0.5 group">
                        GitHub
                        <MdArrowOutward className="opacity-0 group-hover:opacity-100 transition-all transform duration-250 text-light-base/60" />
                    </div>
                </div>

                <div className="flex gap-x-8">
                    <div className="cursor-pointer hover:underline hover:underline-offset-2">
                        Privacy Policy
                    </div>
                    <div className="cursor-pointer hover:underline hover:underline-offset-2">
                        Terms of Service
                    </div>
                    <div className="text-light-base/50 pointer-events-none">@ Solmarket 2026</div>
                </div>
            </div>
        </div>
    );
}

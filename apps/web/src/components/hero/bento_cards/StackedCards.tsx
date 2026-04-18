import { cn } from '@/lib/utils';
import CardHeader from './CardHeader';

export default function StackedCards() {
    return (
        <div className="group relative flex h-150 flex-col overflow-hidden bg-neutral-950 p-10 transition-transform duration-300 ease-out">
            <CardHeader label="Live Markets" context="On-Chain Predictions" />

            <div className="mt-5">
                <h3 className="text-[1.75rem] font-semibold leading-tight text-white">
                    Real-Time Markets &
                    <br />
                    On-Chain Trading Signals
                </h3>
                <p className="mt-3 text-sm text-neutral-400">
                    Track live prediction markets, monitor liquidity, and react instantly with
                    real-time on-chain data.
                </p>
            </div>

            <div className="relative mt-25 flex flex-1 items-end justify-center">
                <div className="absolute left-20 -top-5 h-110 w-70 bg-linear-to-b from-[#16161A] via-[#16161A] to-black rounded-sm p-4 flex flex-col gap-y-4 z-1">
                    <h4 className="text-sm text-neutral-300">Markets</h4>

                    {[
                        'BTC > $100K (2026)',
                        'ETH > $5K',
                        'SOL Flip ETH (Market Cap)',
                        'US Fed Rate Cut Q3',
                        'Bitcoin ETF Inflows > $10B',
                        'AI Tokens Market Cap > $500B',
                    ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-neutral-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-alpha" />
                                {item}
                            </div>
                            <span className="text-neutral-500">LIVE</span>
                        </div>
                    ))}
                </div>

                <div className="absolute left-50 top-8 h-100 w-70 bg-linear-to-b from-[#16161A] via-[#16161A] to-black rounded-sm p-4 flex flex-col gap-y-4 z-2 shadow-[-12px_0_30px_rgba(0,0,0,0.35)]">
                    <h4 className="text-sm text-neutral-300">Market Stats</h4>

                    <div className="space-y-2 text-sm">
                        <Stat label="Total Volume" value="$1.8M" />
                        <Stat label="Active Markets" value="42" />
                        <Stat label="Trades / min" value="280" />
                        <Stat label="Avg Finality" value="<1s" />
                        <Stat label="Liquidity Locked" value="$920K" />
                        <Stat label="Active Traders" value="1,240" />
                    </div>

                    <div className="mt-3 border-t border-neutral-800 pt-3">
                        <h4 className="text-sm text-neutral-300 mb-2 opacity-40">Network</h4>
                        <div className="space-y-2 text-sm">
                            <Stat className="opacity-20" label="TPS" value="65,000" />
                            <Stat label="Fees" value="$0.00025" />
                            <Stat label="Latency" value="~400ms" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
    return (
        <div className={cn('flex justify-between text-neutral-400', className)}>
            <span>{label}:</span>
            <span className="text-white">{value}</span>
        </div>
    );
}

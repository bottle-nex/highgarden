import { JSX } from 'react';

export default function Applogo(): JSX.Element {
    return (
        <div className="flex gap-x-2 items-center">
            <div className="h-10 w-10 rounded-sm flex items-center justify-center shrink-0">H</div>

            <div className="h-8 w-full flex flex-col -space-y-0.5">
                <span className="text-gray-300 text-[14px] tracking-wider">Highgarden</span>
                <span className="text-[11px] text-gray-600 tracking-wide">Solana markets</span>
            </div>
        </div>
    );
}

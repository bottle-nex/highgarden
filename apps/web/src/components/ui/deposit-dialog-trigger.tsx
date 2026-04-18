'use client';
import { JSX, useState } from 'react';
import DepositDialog from './deposit-dialog';

export default function DepositDialogTrigger(): JSX.Element {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-50 px-4 py-2 bg-white text-black font-mono text-xs tracking-widest uppercase"
            >
                Open Deposit
            </button>
            {open && <DepositDialog onClose={() => setOpen(false)} />}
        </>
    );
}

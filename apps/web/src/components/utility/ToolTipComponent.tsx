import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React from 'react';

interface ToolTipComponentProps {
    children: React.ReactNode;
    content: React.ReactNode;
    duration?: number;
    className?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
}

export default function ToolTipComponent({
    children,
    className,
    duration = 100,
    content,
    side = 'bottom',
}: ToolTipComponentProps) {
    return (
        <TooltipProvider delay={duration}>
            <Tooltip>
                <TooltipTrigger render={children as React.ReactElement} />
                <TooltipContent className={className} side={side} sideOffset={5}>
                    <span>{content}</span>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

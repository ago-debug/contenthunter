"use client";

import { Info } from "lucide-react";
import { HoverTooltip } from "./HoverTooltip";

type InfoHintProps = {
    text: string;
    className?: string;
    /** Default "top". Usa "bottom" vicino al bordo superiore del viewport per evitare clip. */
    side?: "top" | "bottom";
};

/** Icona info con tooltip vignetta (stesso stile di HoverTooltip). */
export default function InfoHint({ text, className = "", side = "top" }: InfoHintProps) {
    return (
        <HoverTooltip text={text} side={side} className={`isolate ${className}`}>
            <button
                type="button"
                tabIndex={0}
                aria-label={text}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
                <Info className="w-2.5 h-2.5" />
            </button>
        </HoverTooltip>
    );
}

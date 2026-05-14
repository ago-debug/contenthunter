"use client";

import React, { useId } from "react";

export type HoverTooltipProps = {
    text: string;
    children: React.ReactNode;
    /** Tooltip sopra il trigger (default) o sotto */
    side?: "top" | "bottom";
    className?: string;
};

/**
 * Tooltip a fumetto: bolla arrotondata + coda; z-index alto per stare sopra sticky/header/modali.
 */
export function HoverTooltip({ text, children, side = "top", className = "" }: HoverTooltipProps) {
    const trimmed = className.trim();
    const anchor =
        trimmed.startsWith("absolute") || trimmed.includes(" absolute") ? "" : "relative";
    const uid = useId().replace(/[:]/g, "");

    const bubble = (
        <div className="relative rounded-[1.35rem] border border-slate-200/95 bg-gradient-to-b from-white to-slate-50/95 px-3.5 py-2.5 text-left text-[11px] font-medium leading-snug text-slate-600 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.22)] ring-1 ring-slate-900/[0.06]">
            {text}
        </div>
    );

    /** Coda verso il basso (bolla sopra il trigger) */
    const TailDown = () => (
        <svg
            width="26"
            height="12"
            viewBox="0 0 26 12"
            className="pointer-events-none -mt-px shrink-0 self-center text-white drop-shadow-[0_4px_6px_rgba(15,23,42,0.08)]"
            aria-hidden
        >
            <path
                d="M1 0 L13 11 L25 0"
                fill={`url(#tt-fill-${uid})`}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeLinejoin="round"
            />
            <defs>
                <linearGradient id={`tt-fill-${uid}`} x1="13" y1="0" x2="13" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fafafa" />
                    <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
            </defs>
        </svg>
    );

    /** Coda verso l’alto (bolla sotto il trigger) */
    const TailUp = () => (
        <svg
            width="26"
            height="12"
            viewBox="0 0 26 12"
            className="pointer-events-none -mb-px shrink-0 self-center rotate-180 text-white drop-shadow-[0_-4px_6px_rgba(15,23,42,0.08)]"
            aria-hidden
        >
            <path
                d="M1 0 L13 11 L25 0"
                fill={`url(#tt-fill-up-${uid})`}
                stroke="#e2e8f0"
                strokeWidth="1"
                strokeLinejoin="round"
            />
            <defs>
                <linearGradient id={`tt-fill-up-${uid}`} x1="13" y1="0" x2="13" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#ffffff" />
                    <stop offset="1" stopColor="#f8fafc" />
                </linearGradient>
            </defs>
        </svg>
    );

    return (
        <div className={`group inline-flex max-w-full ${anchor} ${className}`}>
            {children}
            <div
                role="tooltip"
                className={
                    side === "top"
                        ? "pointer-events-none absolute bottom-full left-1/2 z-[100100] mb-1 flex w-max max-w-[min(360px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col items-center opacity-0 invisible transition-opacity duration-150 group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
                        : "pointer-events-none absolute left-1/2 top-full z-[100100] mt-1 flex w-max max-w-[min(360px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col items-center opacity-0 invisible transition-opacity duration-150 group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
                }
            >
                {side === "top" ? (
                    <>
                        {bubble}
                        <TailDown />
                    </>
                ) : (
                    <>
                        <TailUp />
                        {bubble}
                    </>
                )}
            </div>
        </div>
    );
}

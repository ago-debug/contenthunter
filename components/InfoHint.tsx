"use client";

import { Info } from "lucide-react";

type InfoHintProps = {
  text: string;
  className?: string;
};

export default function InfoHint({ text, className = "" }: InfoHintProps) {
  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        <Info className="w-2.5 h-2.5" />
      </button>
      <span className="pointer-events-none absolute z-[300] left-1/2 -translate-x-1/2 top-6 min-w-[220px] max-w-[300px] rounded-lg bg-slate-900 text-white text-[10px] font-semibold leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shadow-xl">
        {text}
      </span>
    </span>
  );
}

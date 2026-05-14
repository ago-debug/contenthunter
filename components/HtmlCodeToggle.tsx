"use client";

import React, { useId, useMemo, useState } from "react";

type Mode = "code" | "html";

export type HtmlCodeToggleProps = {
    value: string;
    onChange?: (next: string) => void;
    readOnly?: boolean;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    /** Etichette tab (default Codice / HTML) */
    codeLabel?: string;
    htmlLabel?: string;
};

function buildPreviewDoc(html: string): string {
    const body = html.trim() ? html : '<p style="color:#94a3b8;font-style:italic">Nessun contenuto</p>';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#1e293b;padding:16px;margin:0;}
      p{margin:0 0 0.75em;} ul,ol{padding-left:1.25rem;} img{max-width:100%;height:auto;}
      h1,h2,h3,h4{margin:0.5em 0 0.35em;font-weight:800;}
    </style></head><body>${body}</body></html>`;
}

/**
 * Due viste: sorgente (textarea) e anteprima HTML (iframe sandbox senza script).
 */
export function HtmlCodeToggle({
    value,
    onChange,
    readOnly = false,
    minHeight = 260,
    className = "",
    placeholder = "",
    codeLabel = "Codice",
    htmlLabel = "HTML",
}: HtmlCodeToggleProps) {
    const [mode, setMode] = useState<Mode>("code");
    const baseId = useId();
    const srcDoc = useMemo(() => buildPreviewDoc(value), [value]);

    const tabBtn = (m: Mode, label: string) => (
        <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            id={`${baseId}-${m}`}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                mode === m
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className={`space-y-2 ${className}`}>
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Modalità visualizzazione">
                {tabBtn("code", codeLabel)}
                {tabBtn("html", htmlLabel)}
                {readOnly ? (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sola lettura</span>
                ) : null}
            </div>
            {mode === "code" ? (
                <textarea
                    id={`${baseId}-code`}
                    value={value}
                    readOnly={readOnly}
                    onChange={readOnly || !onChange ? undefined : (e) => onChange(e.target.value)}
                    placeholder={placeholder || undefined}
                    spellCheck={false}
                    style={{ minHeight }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono text-slate-800 leading-relaxed resize-y focus:outline-none focus:ring-4 focus:ring-amber-50/80 focus:border-amber-200/80 read-only:opacity-95"
                />
            ) : (
                <iframe
                    title="Anteprima HTML"
                    sandbox=""
                    srcDoc={srcDoc}
                    className="w-full rounded-2xl border border-slate-200 bg-white shadow-inner"
                    style={{ minHeight }}
                />
            )}
        </div>
    );
}

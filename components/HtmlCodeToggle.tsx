"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bold, Italic, Underline, Palette } from "lucide-react";

type Mode = "visual" | "code";

export type HtmlCodeToggleProps = {
    value: string;
    onChange?: (next: string) => void;
    readOnly?: boolean;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    codeLabel?: string;
    /** Tab visuale: sola lettura = anteprima; editing = editor RTF. */
    visualLabel?: string;
};

function buildPreviewDoc(html: string): string {
    const body = html.trim() ? html : '<p style="color:#94a3b8;font-style:italic">Nessun contenuto</p>';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.55;color:#1e293b;padding:16px;margin:0;}
      p{margin:0 0 0.75em;} ul,ol{padding-left:1.25rem;} img{max-width:100%;height:auto;}
      h1,h2,h3,h4{margin:0.5em 0 0.35em;font-weight:800;}
    </style></head><body>${body}</body></html>`;
}

function RichToolbar({
    editorRef,
    disabled,
}: {
    editorRef: React.RefObject<HTMLDivElement | null>;
    disabled?: boolean;
}) {
    const run = (cmd: string, val?: string) => {
        const el = editorRef.current;
        if (!el || disabled) return;
        el.focus();
        try {
            document.execCommand(cmd, false, val);
        } catch {
            /* ignore */
        }
    };

    const wrapFontSize = (px: string) => {
        const el = editorRef.current;
        if (!el || disabled) return;
        el.focus();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed) return;
        const span = document.createElement("span");
        span.style.fontSize = `${px}px`;
        try {
            range.surroundContents(span);
        } catch {
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
        sel.removeAllRanges();
    };

    const btnClass =
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40";

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border border-slate-200 border-b-0 bg-gradient-to-b from-slate-100 to-slate-50 px-2 py-2">
            <button
                type="button"
                className={btnClass}
                title="Grassetto"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("bold")}
            >
                <Bold className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={btnClass}
                title="Corsivo"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("italic")}
            >
                <Italic className="h-4 w-4" />
            </button>
            <button
                type="button"
                className={btnClass}
                title="Sottolineato"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run("underline")}
            >
                <Underline className="h-4 w-4" />
            </button>
            <div className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-black uppercase text-slate-600">
                <span className="hidden sm:inline">Colore</span>
                <Palette className="h-3.5 w-3.5 sm:hidden" />
                <input
                    type="color"
                    defaultValue="#1e293b"
                    disabled={disabled}
                    className="h-7 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onChange={(e) => run("foreColor", e.target.value)}
                />
            </label>
            <select
                disabled={disabled}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black uppercase text-slate-700"
                defaultValue=""
                onMouseDown={(e) => e.preventDefault()}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v) wrapFontSize(v);
                    e.target.value = "";
                }}
            >
                <option value="">Dimensione</option>
                <option value="12">12 px</option>
                <option value="14">14 px</option>
                <option value="16">16 px</option>
                <option value="18">18 px</option>
                <option value="22">22 px</option>
                <option value="26">26 px</option>
            </select>
        </div>
    );
}

/**
 * Editor visuale (HTML) con toolbar base, tab Codice (sorgente), default su Editor/Anteprima.
 */
export function HtmlCodeToggle({
    value,
    onChange,
    readOnly = false,
    minHeight = 260,
    className = "",
    placeholder = "",
    codeLabel = "Codice",
    visualLabel,
}: HtmlCodeToggleProps) {
    const [mode, setMode] = useState<Mode>("visual");
    const baseId = useId();
    const editorRef = useRef<HTMLDivElement>(null);
    /** Evita di riscrivere innerHTML mentre l’editor ha il focus (altrimenti si perdono i caratteri in digitazione). */
    const editorHasFocusRef = useRef(false);
    const lastEmitted = useRef<string | null>(null);
    const srcDoc = useMemo(() => buildPreviewDoc(value), [value]);

    const vLabel = visualLabel ?? (readOnly ? "Anteprima" : "Editor");

    useEffect(() => {
        if (readOnly || mode !== "visual") return;
        const el = editorRef.current;
        if (!el) return;
        if (editorHasFocusRef.current) return;

        const next = value?.trim() ? value : "<p><br></p>";
        if (el.innerHTML !== next) {
            el.innerHTML = next;
        }
        lastEmitted.current = next;
    }, [value, mode, readOnly]);

    const commitEditor = useCallback(() => {
        const el = editorRef.current;
        if (!el || !onChange) return;
        const html = el.innerHTML;
        lastEmitted.current = html;
        onChange(html);
    }, [onChange]);

    const setModeSafe = (m: Mode) => {
        if (m === mode) return;
        if (mode === "visual" && !readOnly) commitEditor();
        setMode(m);
    };

    const tabBtn = (m: Mode, label: string) => (
        <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            id={`${baseId}-${m}`}
            onClick={() => setModeSafe(m)}
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
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Modalità contenuto">
                {tabBtn("visual", vLabel)}
                {tabBtn("code", codeLabel)}
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
            ) : readOnly ? (
                <iframe
                    title="Anteprima HTML"
                    sandbox=""
                    srcDoc={srcDoc}
                    className="w-full rounded-2xl border border-slate-200 bg-white shadow-inner"
                    style={{ minHeight }}
                />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
                    <RichToolbar editorRef={editorRef} disabled={readOnly} />
                    <div
                        ref={editorRef}
                        className="px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-inset focus:ring-amber-100/80"
                        contentEditable={!readOnly}
                        suppressContentEditableWarning
                        style={{ minHeight }}
                        onFocus={() => {
                            editorHasFocusRef.current = true;
                        }}
                        onBlur={() => {
                            editorHasFocusRef.current = false;
                            if (onChange) commitEditor();
                        }}
                        onInput={() => {
                            if (onChange && editorRef.current) {
                                lastEmitted.current = editorRef.current.innerHTML;
                                onChange(editorRef.current.innerHTML);
                            }
                        }}
                    />
                </div>
            )}
        </div>
    );
}

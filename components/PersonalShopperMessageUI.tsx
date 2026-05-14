"use client";

import React from "react";
import type { RecommendedProductChip } from "@/lib/personal-shopper-enrich";
import { ExternalLink, Sparkles } from "lucide-react";

/** Rendering leggero **grassetto** nel testo della reply. */
export function ShopperReplyText({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
        <div className="leading-relaxed">
            {parts.map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                        <strong key={i} className="font-black text-slate-900">
                            {part.slice(2, -2)}
                        </strong>
                    );
                }
                return (
                    <span key={i} className="whitespace-pre-wrap font-medium">
                        {part}
                    </span>
                );
            })}
        </div>
    );
}

export function PersonalShopperSuggestedProducts({
    variant,
    products,
    onOpenInApp,
}: {
    variant: "app" | "embed";
    products: RecommendedProductChip[];
    onOpenInApp?: (sku: string) => void;
}) {
    if (!products.length) return null;

    return (
        <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-800/90">Suggeriti</p>
            <ul className="flex flex-col gap-1.5">
                {products.map((p) => (
                    <li key={p.sku}>
                        {variant === "embed" && p.storeUrl ? (
                            <a
                                href={p.storeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-[12px] font-bold text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-50"
                            >
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span className="min-w-0 leading-snug">{p.title}</span>
                            </a>
                        ) : variant === "embed" && !p.storeUrl ? (
                            <span className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                {p.title}
                                <span className="sr-only"> (URL negozio non disponibile)</span>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onOpenInApp?.(p.sku)}
                                className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-[12px] font-bold text-amber-950 shadow-sm transition hover:border-amber-400 hover:bg-amber-50"
                            >
                                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span className="min-w-0 leading-snug">{p.title}</span>
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function PersonalShopperFollowUpChips({
    chips,
    chipRole,
    interaction,
    onSelect,
}: {
    chips: string[];
    chipRole: "options" | "answer_chips";
    interaction: "buttons" | "hints_only";
    onSelect: (text: string) => void;
}) {
    if (!chips.length) return null;

    if (interaction === "hints_only") {
        return (
            <div className="mt-3 border-t border-slate-200/80 pt-3">
                <p className="mb-1.5 w-full text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Spunti (scrivi tu in chat)
                </p>
                <ul className="space-y-1">
                    {chips.map((line, j) => (
                        <li key={j} className="text-[11px] leading-snug text-slate-500">
                            · {line}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    const heading =
        chipRole === "options"
            ? "Scegli un'opzione"
            : "Tocca una risposta da inviare";

    return (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
            <p className="w-full text-[9px] font-black uppercase tracking-widest text-slate-500">{heading}</p>
            {chips.map((q, j) => (
                <button
                    key={j}
                    type="button"
                    onClick={() => onSelect(q)}
                    className="max-w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-[11px] font-semibold leading-snug text-slate-800 shadow-sm transition hover:border-amber-400 hover:bg-amber-50"
                >
                    {q}
                </button>
            ))}
        </div>
    );
}

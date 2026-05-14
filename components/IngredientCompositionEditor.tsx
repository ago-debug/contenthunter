"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { technicalSheetNoteKey } from "@/lib/technical-sheet-fields";
import {
    INGREDIENT_COMPOSITION_KEY,
    INGREDIENTS_FIELD_KEY,
    INGREDIENT_UNITS,
    emptyIngredientLine,
    parseIngredientComposition,
    serializeIngredientComposition,
    type IngredientLine,
} from "@/lib/technical-sheet-ingredients";

type PickRow = { id: number; name: string; description: string | null };

const CREA_BTN =
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-amber-900 bg-gradient-to-b from-amber-50 to-amber-100/90 border border-amber-200/80 shadow-sm hover:from-amber-100 hover:to-amber-50 transition-all shrink-0";

type Props = {
    selectedProduct: any;
    setSelectedProduct: (p: any) => void;
    getExtraValue: (p: any, key: string) => string;
    setExtraValue: (p: any, key: string, value: string) => any;
    picklistRows: PickRow[];
    onOpenCreate: () => void;
    onAddNewName: (name: string) => void;
};

export function IngredientCompositionEditor({
    selectedProduct,
    setSelectedProduct,
    getExtraValue,
    setExtraValue,
    picklistRows,
    onOpenCreate,
    onAddNewName,
}: Props) {
    const [lines, setLines] = useState<IngredientLine[]>(() =>
        parseIngredientComposition(getExtraValue(selectedProduct, INGREDIENT_COMPOSITION_KEY))
    );

    useEffect(() => {
        setLines(parseIngredientComposition(getExtraValue(selectedProduct, INGREDIENT_COMPOSITION_KEY)));
    }, [selectedProduct?.id]);

    const persistLines = (next: IngredientLine[]) => {
        setLines(next);
        let p = setExtraValue(selectedProduct, INGREDIENT_COMPOSITION_KEY, serializeIngredientComposition(next));
        setSelectedProduct(p);
    };

    const selectOpts = picklistRows.map((x) => ({
        value: x.id,
        label: x.name,
        subLabel: x.description || undefined,
    }));

    const updateLine = (idx: number, patch: Partial<IngredientLine>) => {
        const next = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
        persistLines(next);
    };

    const addLine = () => {
        if (lines.length >= 12) return;
        persistLines([...lines, emptyIngredientLine()]);
    };

    const removeLine = (idx: number) => {
        if (lines.length <= 1) {
            persistLines([emptyIngredientLine()]);
            return;
        }
        persistLines(lines.filter((_, i) => i !== idx));
    };

    const fieldLabel = "Ingredienti";
    const shortTitle = "Ingredienti";

    return (
        <div className="md:col-span-2 space-y-4">
            <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <span className="inline-block max-w-[min(100%,42rem)] px-4 py-2.5 rounded-2xl bg-gradient-to-br from-white via-slate-50/95 to-amber-50/50 border border-slate-200/90 shadow-[0_8px_28px_rgba(15,23,42,0.07)] text-[11px] sm:text-xs font-black uppercase tracking-wide text-slate-800 leading-snug">
                        {fieldLabel}
                    </span>
                    <p className="text-[10px] font-semibold text-slate-500 max-w-2xl pl-1">
                        Composizione / ricetta: fino a 12 righe. Per ogni riga scegli un ingrediente dall&apos;elenco aziendale (o
                        integra il nome), indica quantità e unità (g, ml, …).
                    </p>
                </div>
                <button type="button" onClick={onOpenCreate} className={CREA_BTN}>
                    <Plus className="w-4 h-4" /> CREA
                </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                {lines.map((line, idx) => (
                    <div
                        key={line.id}
                        className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end"
                    >
                        <div className="min-w-0 flex-1 basis-[220px]">
                            <span className="text-[9px] font-black uppercase text-slate-400">Ingrediente {idx + 1}</span>
                            <div className="mt-1">
                                <SearchableSelect
                                    options={selectOpts}
                                    value={line.picklistId}
                                    onChange={(val) => {
                                        if (val == null) {
                                            updateLine(idx, { picklistId: null });
                                            return;
                                        }
                                        const row = picklistRows.find((x) => x.id === Number(val));
                                        updateLine(idx, {
                                            picklistId: Number(val),
                                            label: row ? String(row.name || "").trim() : line.label,
                                        });
                                    }}
                                    onAddNew={(name) => {
                                        onAddNewName(name);
                                    }}
                                    placeholder="Da elenco ingredienti…"
                                    dropdownMinWidth={280}
                                />
                            </div>
                            <input
                                type="text"
                                value={line.label}
                                onChange={(e) => updateLine(idx, { label: e.target.value })}
                                placeholder="Nome in etichetta / PDF (modificabile)"
                                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            <div className="w-24">
                                <span className="text-[9px] font-black uppercase text-slate-400">Qty</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={line.qty}
                                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                                    placeholder="0"
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-mono"
                                />
                            </div>
                            <div className="w-28">
                                <span className="text-[9px] font-black uppercase text-slate-400">Unità</span>
                                <select
                                    value={line.unit}
                                    onChange={(e) => updateLine(idx, { unit: e.target.value })}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm font-bold text-slate-800"
                                >
                                    {INGREDIENT_UNITS.map((u) => (
                                        <option key={u.value || "none"} value={u.value}>
                                            {u.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                title="Rimuovi riga"
                                onClick={() => removeLine(idx)}
                                className="mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 sm:mb-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
                <button
                    type="button"
                    disabled={lines.length >= 12}
                    onClick={addLine}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                    <Plus className="w-4 h-4" /> Aggiungi ingrediente ({lines.length}/12)
                </button>
            </div>

            <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">
                    Testo introduttivo (opzionale; usato in PDF sopra l&apos;elenco)
                </label>
                <textarea
                    rows={3}
                    value={getExtraValue(selectedProduct, INGREDIENTS_FIELD_KEY)}
                    onChange={(e) => setSelectedProduct(setExtraValue(selectedProduct, INGREDIENTS_FIELD_KEY, e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-amber-200/80 focus:outline-none focus:ring-4 focus:ring-amber-50"
                    placeholder="Es. Composizione: …"
                />
            </div>

            <div>
                <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block leading-snug">
                    Note aggiuntive su questo prodotto ({shortTitle})
                </label>
                <textarea
                    rows={2}
                    value={getExtraValue(selectedProduct, technicalSheetNoteKey(INGREDIENTS_FIELD_KEY))}
                    onChange={(e) =>
                        setSelectedProduct(
                            setExtraValue(selectedProduct, technicalSheetNoteKey(INGREDIENTS_FIELD_KEY), e.target.value)
                        )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    placeholder="Varianti, lotti, eccezioni…"
                />
            </div>
        </div>
    );
}

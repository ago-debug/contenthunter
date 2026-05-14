"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";

export type ProductLotEditorRow = {
    id?: number;
    lotCode: string;
    quantity: string;
    expiryDate: string;
    receivedAt: string;
    notes: string;
    sortOrder?: number;
};

type Props = {
    lots: ProductLotEditorRow[];
    onChange: (next: ProductLotEditorRow[]) => void;
    readOnly?: boolean;
};

function emptyRow(): ProductLotEditorRow {
    return {
        lotCode: "",
        quantity: "0",
        expiryDate: "",
        receivedAt: "",
        notes: "",
    };
}

export function ProductLotsPanel({ lots, onChange, readOnly }: Props) {
    const rows = Array.isArray(lots) && lots.length > 0 ? lots : [emptyRow()];

    const update = (index: number, patch: Partial<ProductLotEditorRow>) => {
        const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
        onChange(next);
    };

    const addRow = () => {
        onChange([...rows, emptyRow()]);
    };

    const removeRow = (index: number) => {
        if (rows.length <= 1) {
            onChange([emptyRow()]);
            return;
        }
        onChange(rows.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600">
                Gestisci i lotti per questo SKU: codice lotto, quantità, date di scadenza / ingresso e note. Il salvataggio
                sostituisce l&apos;elenco quando confermi &quot;Esegui Salvataggio&quot; (come per gli extra).
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <tr>
                            <th className="px-3 py-2">Codice lotto</th>
                            <th className="px-3 py-2 w-28">Quantità</th>
                            <th className="px-3 py-2 w-36">Scadenza</th>
                            <th className="px-3 py-2 w-36">Ingresso</th>
                            <th className="px-3 py-2 min-w-[8rem]">Note</th>
                            {!readOnly && <th className="px-2 py-2 w-12" />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={row.id ?? `new-${index}`} className="border-t border-slate-100">
                                <td className="px-2 py-1.5 align-middle">
                                    <input
                                        type="text"
                                        disabled={readOnly}
                                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
                                        value={row.lotCode}
                                        onChange={(e) => update(index, { lotCode: e.target.value })}
                                        placeholder="es. L2025-042"
                                    />
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={readOnly}
                                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
                                        value={row.quantity}
                                        onChange={(e) => update(index, { quantity: e.target.value })}
                                    />
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                    <input
                                        type="date"
                                        disabled={readOnly}
                                        className="w-full rounded border border-slate-200 px-1 py-1 text-sm disabled:bg-slate-50"
                                        value={row.expiryDate}
                                        onChange={(e) => update(index, { expiryDate: e.target.value })}
                                    />
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                    <input
                                        type="date"
                                        disabled={readOnly}
                                        className="w-full rounded border border-slate-200 px-1 py-1 text-sm disabled:bg-slate-50"
                                        value={row.receivedAt}
                                        onChange={(e) => update(index, { receivedAt: e.target.value })}
                                    />
                                </td>
                                <td className="px-2 py-1.5 align-middle">
                                    <input
                                        type="text"
                                        disabled={readOnly}
                                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
                                        value={row.notes}
                                        onChange={(e) => update(index, { notes: e.target.value })}
                                        placeholder="Magazzino, ubicazione…"
                                    />
                                </td>
                                {!readOnly && (
                                    <td className="px-1 py-1.5 align-middle text-center">
                                        <button
                                            type="button"
                                            className="inline-flex rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                            onClick={() => removeRow(index)}
                                            title="Rimuovi riga"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!readOnly && (
                <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                    <Plus className="h-4 w-4" />
                    Aggiungi lotto
                </button>
            )}
        </div>
    );
}

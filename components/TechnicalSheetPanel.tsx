"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { FileSpreadsheet, Plus, Printer, Save } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { HtmlCodeToggle } from "@/components/HtmlCodeToggle";
import { IngredientCompositionEditor } from "@/components/IngredientCompositionEditor";
import {
    TECH_SHEET_TEXT_FIELDS,
    PICKLIST_CATEGORY,
    technicalSheetPickIdKey,
    technicalSheetNoteKey,
} from "@/lib/technical-sheet-fields";
import {
    INGREDIENTS_FIELD_KEY,
    INGREDIENT_COMPOSITION_KEY,
    emptyIngredientLine,
    parseIngredientComposition,
    serializeIngredientComposition,
    type IngredientLine,
} from "@/lib/technical-sheet-ingredients";

type PickRow = { id: number; name: string; description: string | null };

/** Titolo sezione breve per etichette contestuali (es. note legate a «Ingredienti»). */
function technicalFieldShortTitle(label: string): string {
    const t = label.trim();
    if (t.includes("—")) return t.split("—")[0].trim();
    if (t.length > 48) return `${t.slice(0, 46)}…`;
    return t;
}

const CREA_PICKLIST_BTN =
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-amber-900 bg-gradient-to-b from-amber-50 to-amber-100/90 border border-amber-200/80 shadow-sm hover:from-amber-100 hover:to-amber-50 transition-all shrink-0";

type Props = {
    selectedProduct: any;
    setSelectedProduct: (p: any) => void;
    getExtraValue: (p: any, key: string) => string;
    setExtraValue: (p: any, key: string, value: string) => any;
    companyReq: Record<string, unknown>;
};

export function TechnicalSheetPanel({ selectedProduct, setSelectedProduct, getExtraValue, setExtraValue, companyReq }: Props) {
    const [packagingOpts, setPackagingOpts] = useState<PickRow[]>([]);
    const [palettOpts, setPalettOpts] = useState<PickRow[]>([]);
    const [branding, setBranding] = useState({ header: "", logoUrl: "" });
    const [brandingDirty, setBrandingDirty] = useState(false);
    const [savingBrand, setSavingBrand] = useState(false);
    const [printHeader, setPrintHeader] = useState(true);
    const [printLogo, setPrintLogo] = useState(true);
    const [pdfLoading, setPdfLoading] = useState(false);

    const [modal, setModal] = useState<{
        category: string;
        title: string;
        name: string;
        description: string;
    } | null>(null);

    const [schedaPicklists, setSchedaPicklists] = useState<Record<string, PickRow[]>>({});

    const reloadPicklists = useCallback(async () => {
        try {
            const fieldReqs = TECH_SHEET_TEXT_FIELDS.map((f) =>
                axios
                    .get<{ items: PickRow[] }>(
                        `/api/technical-picklist?category=${encodeURIComponent(f.key)}`,
                        companyReq
                    )
                    .then((r) => ({ key: f.key, items: Array.isArray(r.data?.items) ? r.data.items : [] }))
            );
            const [pkg, pal, ...fieldResults] = await Promise.all([
                axios.get<{ items: PickRow[] }>(`/api/technical-picklist?category=${PICKLIST_CATEGORY.packaging}`, companyReq),
                axios.get<{ items: PickRow[] }>(`/api/technical-picklist?category=${PICKLIST_CATEGORY.palett}`, companyReq),
                ...fieldReqs,
            ]);
            setPackagingOpts(Array.isArray(pkg.data?.items) ? pkg.data.items : []);
            setPalettOpts(Array.isArray(pal.data?.items) ? pal.data.items : []);
            const map: Record<string, PickRow[]> = {};
            for (const fr of fieldResults) {
                map[fr.key] = fr.items;
            }
            setSchedaPicklists(map);
        } catch {
            toast.error("Impossibile caricare gli elenchi tecnici / logistici");
        }
    }, [companyReq]);

    useEffect(() => {
        void reloadPicklists();
        void axios
            .get<{ technicalSheetPdfHeader?: string; technicalSheetPdfLogoUrl?: string }>(
                "/api/company/technical-sheet-print",
                companyReq
            )
            .then((r) => {
                setBranding({
                    header: r.data?.technicalSheetPdfHeader ?? "",
                    logoUrl: r.data?.technicalSheetPdfLogoUrl ?? "",
                });
                setBrandingDirty(false);
            })
            .catch(() => {});
    }, [companyReq, reloadPicklists]);

    const titleIt = selectedProduct?.translations?.it?.title || selectedProduct?.title || "";
    const descIt = selectedProduct?.translations?.it?.description || selectedProduct?.description || "";

    const openCreateModal = (category: string, title: string) => {
        setModal({ category, title, name: "", description: "" });
    };

    const submitCreatePicklist = async () => {
        if (!modal?.name.trim()) {
            toast.warning("Inserisci un nome");
            return;
        }
        try {
            const { data } = await axios.post(
                "/api/technical-picklist",
                {
                    category: modal.category,
                    name: modal.name.trim(),
                    description: modal.description.trim() || null,
                },
                companyReq
            );
            await reloadPicklists();
            if (modal.category === PICKLIST_CATEGORY.packaging) {
                setSelectedProduct({ ...selectedProduct, technicalPackagingId: data.id });
            } else if (modal.category === PICKLIST_CATEGORY.palett) {
                setSelectedProduct({ ...selectedProduct, technicalPalettId: data.id });
            } else if (modal.category === INGREDIENTS_FIELD_KEY) {
                const cur = parseIngredientComposition(getExtraValue(selectedProduct, INGREDIENT_COMPOSITION_KEY));
                const nm = String(data.name || "").trim();
                const desc = String(data.description || "").trim();
                const newLine: IngredientLine = {
                    ...emptyIngredientLine(),
                    picklistId: Number(data.id),
                    label: (desc || nm).trim(),
                };
                const isPlaceholderOnly =
                    cur.length === 1 &&
                    !String(cur[0].label || "").trim() &&
                    cur[0].picklistId == null &&
                    !String(cur[0].qty || "").trim();
                const nextLines = isPlaceholderOnly ? [newLine] : [...cur, newLine];
                let next = setExtraValue(
                    selectedProduct,
                    INGREDIENT_COMPOSITION_KEY,
                    serializeIngredientComposition(nextLines)
                );
                next = setExtraValue(next, technicalSheetPickIdKey(INGREDIENTS_FIELD_KEY), "");
                setSelectedProduct(next);
            } else {
                const k = modal.category;
                let next = setExtraValue(selectedProduct, technicalSheetPickIdKey(k), String(data.id));
                next = setExtraValue(next, k, String(data.description || data.name || "").trim());
                setSelectedProduct(next);
            }
            setModal(null);
            toast.success("Voce creata");
        } catch {
            toast.error("Errore creazione voce");
        }
    };

    const saveBranding = async () => {
        setSavingBrand(true);
        try {
            await axios.patch(
                "/api/company/technical-sheet-print",
                {
                    technicalSheetPdfHeader: branding.header,
                    technicalSheetPdfLogoUrl: branding.logoUrl,
                },
                companyReq
            );
            setBrandingDirty(false);
            toast.success("Intestazione PDF salvata");
        } catch {
            toast.error("Salvataggio intestazione fallito");
        } finally {
            setSavingBrand(false);
        }
    };

    const downloadPdf = async () => {
        if (!selectedProduct?.id) return;
        setPdfLoading(true);
        try {
            const q = new URLSearchParams({
                printHeader: printHeader ? "1" : "0",
                printLogo: printLogo ? "1" : "0",
            });
            const r = await fetch(`/api/products/${selectedProduct.id}/technical-sheet-pdf?${q}`, {
                method: "GET",
                credentials: "include",
                headers: {
                    ...(companyReq.headers as Record<string, string>),
                },
            });
            if (!r.ok) {
                toast.error("Generazione PDF non riuscita");
                return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `scheda-tecnica-${String(selectedProduct.sku || "prodotto").replace(/[^\w.-]+/g, "_")}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Errore download PDF");
        } finally {
            setPdfLoading(false);
        }
    };

    const pkgSelectOptions = packagingOpts.map((x) => ({
        value: x.id,
        label: x.name,
        subLabel: x.description || undefined,
    }));
    const palSelectOptions = palettOpts.map((x) => ({
        value: x.id,
        label: x.name,
        subLabel: x.description || undefined,
    }));

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <div className="border-b border-gray-50 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
                            Schede tecniche
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold mt-2 max-w-3xl leading-relaxed">
                            I dati anagrafici (titolo IT, SKU, EAN, descrizione) sono quelli della scheda principale; qui compili i blocchi tecnici e logistici.
                            Ogni blocco tecnico ha elenco aziendale dedicato (come packaging / palettizzazione) più testo e note sul prodotto. Salva il prodotto per persistere tutto.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-600">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={printHeader} onChange={(e) => setPrintHeader(e.target.checked)} />
                                Intestazione in PDF
                            </label>
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={printLogo} onChange={(e) => setPrintLogo(e.target.checked)} />
                                Logo in PDF
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={() => void downloadPdf()}
                            disabled={pdfLoading || !selectedProduct?.id}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-50"
                        >
                            <Printer className="w-4 h-4" />
                            {pdfLoading ? "PDF…" : "Stampa PDF scheda"}
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-700">Intestazione PDF (azienda)</h5>
                    <p className="text-[10px] text-slate-500">
                        Testo libero (anche più righe) e URL pubblico del logo (PNG/JPEG). Usati in stampa se selezionati sopra.
                    </p>
                    <textarea
                        rows={3}
                        value={branding.header}
                        onChange={(e) => {
                            setBranding((b) => ({ ...b, header: e.target.value }));
                            setBrandingDirty(true);
                        }}
                        placeholder="Ragione sociale, indirizzo, recapiti…"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                    <input
                        type="url"
                        value={branding.logoUrl}
                        onChange={(e) => {
                            setBranding((b) => ({ ...b, logoUrl: e.target.value }));
                            setBrandingDirty(true);
                        }}
                        placeholder="https://…/logo.png"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm"
                    />
                    <button
                        type="button"
                        disabled={!brandingDirty || savingBrand}
                        onClick={() => void saveBranding()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        Salva intestazione PDF
                    </button>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6 space-y-4">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-900">Dati da scheda principale (sola lettura)</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400">SKU</span>
                            <p className="font-mono font-bold text-slate-900">{selectedProduct?.sku || "—"}</p>
                        </div>
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400">EAN</span>
                            <p className="font-mono font-bold text-slate-900">{selectedProduct?.ean || "—"}</p>
                        </div>
                        <div className="md:col-span-2">
                            <span className="text-[9px] font-black uppercase text-slate-400">Titolo prodotto (IT)</span>
                            <p className="font-bold text-slate-900">{titleIt || "—"}</p>
                        </div>
                        <div className="md:col-span-2">
                            <span className="text-[9px] font-black uppercase text-slate-400">Descrizione (IT) — Codice / HTML</span>
                            <div className="mt-2">
                                <HtmlCodeToggle value={descIt} readOnly minHeight={180} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {TECH_SHEET_TEXT_FIELDS.map((f) => {
                        if (f.key === INGREDIENTS_FIELD_KEY) {
                            return (
                                <IngredientCompositionEditor
                                    key={f.key}
                                    selectedProduct={selectedProduct}
                                    setSelectedProduct={setSelectedProduct}
                                    getExtraValue={getExtraValue}
                                    setExtraValue={setExtraValue}
                                    picklistRows={schedaPicklists[f.key] || []}
                                    onOpenCreate={() => openCreateModal(f.key, `Nuovo: ${f.label}`)}
                                    onAddNewName={(name) =>
                                        setModal({ category: f.key, title: `Nuovo: ${f.label}`, name, description: "" })
                                    }
                                />
                            );
                        }
                        const pickKey = f.key;
                        const rows = schedaPicklists[pickKey] || [];
                        const selectOpts = rows.map((x) => ({
                            value: x.id,
                            label: x.name,
                            subLabel: x.description || undefined,
                        }));
                        const pickIdRaw = getExtraValue(selectedProduct, technicalSheetPickIdKey(pickKey)).trim();
                        const pickIdNum = pickIdRaw ? parseInt(pickIdRaw, 10) : NaN;
                        const selectValue = Number.isFinite(pickIdNum) ? pickIdNum : null;

                        return (
                            <div key={f.key} className={f.wide ? "md:col-span-2" : undefined}>
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <span className="inline-block max-w-[min(100%,42rem)] px-4 py-2.5 rounded-2xl bg-gradient-to-br from-white via-slate-50/95 to-sky-50/40 border border-slate-200/90 shadow-[0_8px_28px_rgba(15,23,42,0.07)] text-[11px] sm:text-xs font-black uppercase tracking-wide text-slate-800 leading-snug">
                                        {f.label}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => openCreateModal(f.key, `Nuovo: ${f.label}`)}
                                        className={CREA_PICKLIST_BTN}
                                    >
                                        <Plus className="w-4 h-4" /> CREA
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={selectOpts}
                                    value={selectValue}
                                    onChange={(val) => {
                                        if (val == null) {
                                            const next = setExtraValue(selectedProduct, technicalSheetPickIdKey(pickKey), "");
                                            setSelectedProduct(next);
                                            return;
                                        }
                                        const row = rows.find((x) => x.id === Number(val));
                                        let next = setExtraValue(selectedProduct, technicalSheetPickIdKey(pickKey), String(val));
                                        if (row) {
                                            next = setExtraValue(
                                                next,
                                                pickKey,
                                                String(row.description || row.name || "").trim()
                                            );
                                        }
                                        setSelectedProduct(next);
                                    }}
                                    onAddNew={(name) => {
                                        setModal({
                                            category: f.key,
                                            title: `Nuovo: ${f.label}`,
                                            name,
                                            description: "",
                                        });
                                    }}
                                    placeholder={`Seleziona da elenco ${f.label}…`}
                                    dropdownMinWidth={320}
                                />

                                <label className="text-[9px] font-black uppercase text-slate-400 mt-3 mb-1 block">
                                    Testo in scheda (modificabile; usato in PDF)
                                </label>
                                <textarea
                                    rows={f.rows}
                                    value={getExtraValue(selectedProduct, f.key)}
                                    onChange={(e) =>
                                        setSelectedProduct(setExtraValue(selectedProduct, f.key, e.target.value))
                                    }
                                    className="w-full bg-slate-50/90 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-amber-50 focus:border-amber-200/80 resize-y leading-relaxed"
                                />

                                <label className="text-[9px] font-black uppercase text-slate-400 mt-2 mb-1 block leading-snug">
                                    Note aggiuntive su questo prodotto ({technicalFieldShortTitle(f.label)})
                                </label>
                                <textarea
                                    rows={2}
                                    value={getExtraValue(selectedProduct, technicalSheetNoteKey(pickKey))}
                                    onChange={(e) =>
                                        setSelectedProduct(
                                            setExtraValue(selectedProduct, technicalSheetNoteKey(pickKey), e.target.value)
                                        )
                                    }
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                    placeholder="Varianti, lotti, eccezioni…"
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-slate-100 pb-2">
                        Scheda logistica
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400">Codice articolo</span>
                            <p className="font-mono font-bold">{selectedProduct?.sku || "—"}</p>
                        </div>
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400">Codice EAN</span>
                            <p className="font-mono font-bold">{selectedProduct?.ean || "—"}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Packaging</label>
                            <button
                                type="button"
                                onClick={() => openCreateModal(PICKLIST_CATEGORY.packaging, "Nuovo packaging")}
                                className={CREA_PICKLIST_BTN}
                            >
                                <Plus className="w-4 h-4" /> CREA
                            </button>
                        </div>
                        <SearchableSelect
                            options={pkgSelectOptions}
                            value={selectedProduct?.technicalPackagingId ?? null}
                            onChange={(val) =>
                                setSelectedProduct({
                                    ...selectedProduct,
                                    technicalPackagingId: val == null ? null : Number(val),
                                })
                            }
                            onAddNew={(name) => {
                                setModal({
                                    category: PICKLIST_CATEGORY.packaging,
                                    title: "Nuovo packaging",
                                    name,
                                    description: "",
                                });
                            }}
                            placeholder="Seleziona packaging…"
                            dropdownMinWidth={320}
                        />
                        <label className="text-[9px] font-black uppercase text-slate-400">Descrizione aggiuntiva (su questo prodotto)</label>
                        <textarea
                            rows={2}
                            value={selectedProduct?.technicalPackagingNote ?? ""}
                            onChange={(e) =>
                                setSelectedProduct({ ...selectedProduct, technicalPackagingNote: e.target.value })
                            }
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                            placeholder="Note logistiche specifiche per questa SKU…"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Palettizzazione</label>
                            <button
                                type="button"
                                onClick={() => openCreateModal(PICKLIST_CATEGORY.palett, "Nuova palettizzazione")}
                                className={CREA_PICKLIST_BTN}
                            >
                                <Plus className="w-4 h-4" /> CREA
                            </button>
                        </div>
                        <SearchableSelect
                            options={palSelectOptions}
                            value={selectedProduct?.technicalPalettId ?? null}
                            onChange={(val) =>
                                setSelectedProduct({
                                    ...selectedProduct,
                                    technicalPalettId: val == null ? null : Number(val),
                                })
                            }
                            onAddNew={(name) => {
                                setModal({
                                    category: PICKLIST_CATEGORY.palett,
                                    title: "Nuova palettizzazione",
                                    name,
                                    description: "",
                                });
                            }}
                            placeholder="Seleziona palettizzazione…"
                            dropdownMinWidth={320}
                        />
                        <label className="text-[9px] font-black uppercase text-slate-400">Descrizione aggiuntiva (su questo prodotto)</label>
                        <textarea
                            rows={2}
                            value={selectedProduct?.technicalPalettNote ?? ""}
                            onChange={(e) =>
                                setSelectedProduct({ ...selectedProduct, technicalPalettNote: e.target.value })
                            }
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                            placeholder="Strati, cartoni per strato, tipo bancale…"
                        />
                    </div>
                </div>
            </div>

            {modal ? (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40" onClick={() => setModal(null)}>
                    <div
                        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-8 sm:p-10 space-y-6 border border-slate-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">CREA</p>
                            <h3 className="text-lg sm:text-xl font-black text-slate-900 mt-1">{modal.title}</h3>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400">Nome</label>
                            <input
                                className="w-full mt-2 border border-slate-200 rounded-xl px-4 py-3 text-base"
                                value={modal.name}
                                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400">Descrizione (default elenco)</label>
                            <textarea
                                className="w-full mt-2 border border-slate-200 rounded-xl px-4 py-3 text-sm leading-relaxed"
                                rows={5}
                                value={modal.description}
                                onChange={(e) => setModal({ ...modal, description: e.target.value })}
                            />
                        </div>
                        <div className="flex flex-wrap justify-end gap-3 pt-2">
                            <button
                                type="button"
                                className="px-6 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                onClick={() => setModal(null)}
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                className="px-8 py-3 rounded-xl bg-slate-900 text-white text-sm font-black uppercase tracking-widest hover:bg-black shadow-lg"
                                onClick={() => void submitCreatePicklist()}
                            >
                                CREA
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { FileSpreadsheet, Plus, Printer, Save } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TECH_SHEET_TEXT_FIELDS, PICKLIST_CATEGORY } from "@/lib/technical-sheet-fields";

type PickRow = { id: number; name: string; description: string | null };

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

    const reloadPicklists = useCallback(async () => {
        try {
            const [pkg, pal] = await Promise.all([
                axios.get<{ items: PickRow[] }>(`/api/technical-picklist?category=${PICKLIST_CATEGORY.packaging}`, companyReq),
                axios.get<{ items: PickRow[] }>(`/api/technical-picklist?category=${PICKLIST_CATEGORY.palett}`, companyReq),
            ]);
            setPackagingOpts(Array.isArray(pkg.data?.items) ? pkg.data.items : []);
            setPalettOpts(Array.isArray(pal.data?.items) ? pal.data.items : []);
        } catch {
            toast.error("Impossibile caricare gli elenchi logistici");
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
            } else {
                setSelectedProduct({ ...selectedProduct, technicalPalettId: data.id });
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
            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <div className="border-b border-gray-50 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
                            Schede tecniche
                        </h4>
                        <p className="text-[11px] text-slate-500 font-semibold mt-2 max-w-3xl leading-relaxed">
                            I dati anagrafici (titolo IT, SKU, EAN, descrizione) sono quelli della scheda principale; qui compili i blocchi tecnici e logistici.
                            Packaging e palettizzazione usano elenchi aziendali (creabili da qui). Salva il prodotto per persistere tutto.
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
                            <span className="text-[9px] font-black uppercase text-slate-400">Descrizione (IT)</span>
                            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{descIt || "—"}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {TECH_SHEET_TEXT_FIELDS.map((f) => (
                        <div key={f.key} className={f.wide ? "md:col-span-2" : undefined}>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1.5 block">
                                {f.label}
                            </label>
                            {f.hint ? <p className="text-[9px] text-slate-400 mb-2 ml-1 leading-snug">{f.hint}</p> : null}
                            <textarea
                                rows={f.rows}
                                value={getExtraValue(selectedProduct, f.key)}
                                onChange={(e) =>
                                    setSelectedProduct(setExtraValue(selectedProduct, f.key, e.target.value))
                                }
                                className="w-full bg-slate-50/90 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-amber-50 focus:border-amber-200/80 resize-y leading-relaxed"
                            />
                        </div>
                    ))}
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
                                className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 inline-flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Crea voce
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
                                className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 inline-flex items-center gap-1"
                            >
                                <Plus className="w-3 h-3" /> Crea voce
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
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-sm font-black text-slate-900">{modal.title}</h3>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400">Nome</label>
                            <input
                                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                value={modal.name}
                                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-400">Descrizione (default elenco)</label>
                            <textarea
                                className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                                rows={3}
                                value={modal.description}
                                onChange={(e) => setModal({ ...modal, description: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold"
                                onClick={() => setModal(null)}
                            >
                                Annulla
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-black"
                                onClick={() => void submitCreatePicklist()}
                            >
                                Salva
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

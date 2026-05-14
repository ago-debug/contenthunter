"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { cropViewportCanvasToJpegDataUrl, isValidBbox1000 } from "@/lib/pdf-bbox-crop-browser";
import { Loader2, Scissors, Sparkles, ImageIcon, ChevronRight, BookOpen } from "lucide-react";

type CatalogPdf = { id: number; fileName?: string | null };
type CatalogRow = { id: number; name: string; pdfs?: CatalogPdf[] };

type StagingExtra = { key: string; value: string };
type StagingProduct = {
    id: number;
    sku: string;
    extraFields?: StagingExtra[];
    images?: { id: number; imageUrl: string }[];
};

type AiVisualMapping = { page: number; bbox: number[]; pdfId?: number };

let pdfjsModulePromise: Promise<any> | null = null;

async function getPdfjs() {
    if (!pdfjsModulePromise) {
        pdfjsModulePromise = import("pdfjs-dist").then((mod: any) => {
            const pdfjsLib = mod?.default ?? mod;
            if (typeof window !== "undefined") {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
            }
            return pdfjsLib;
        });
    }
    return pdfjsModulePromise;
}

function parseVisualMapping(extras: StagingExtra[] | undefined): AiVisualMapping | null {
    const raw = (extras || []).find((e) => String(e.key) === "_ai_visual_mapping")?.value;
    if (!raw) return null;
    try {
        const o = JSON.parse(raw) as AiVisualMapping;
        if (o == null || typeof o.page !== "number" || !isValidBbox1000(o.bbox)) return null;
        return o;
    } catch {
        return null;
    }
}

async function renderPdfPageToCanvas(pdf: any, page1Based: number, scale: number): Promise<HTMLCanvasElement> {
    const page = await pdf.getPage(page1Based);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponibile");
    const task = page.render({ canvasContext: ctx, viewport });
    await task.promise;
    return canvas;
}

export default function PdfAiStudioPage() {
    const { data: session, status } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as { companyId?: number } | undefined)?.companyId ?? companyContext?.selectedCompanyId ?? null;

    const companyReq = useMemo(
        () => (effectiveCompanyId != null ? { headers: { "x-company-id": String(effectiveCompanyId) } } : {}),
        [effectiveCompanyId]
    );

    const isGlobalAdminUser = !!(session?.user as { isGlobalAdmin?: boolean })?.isGlobalAdmin;
    const [planPdfAllowed, setPlanPdfAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        if (status !== "authenticated") {
            setPlanPdfAllowed(null);
            return;
        }
        if (isGlobalAdminUser) {
            setPlanPdfAllowed(true);
            return;
        }
        if (effectiveCompanyId == null) {
            setPlanPdfAllowed(false);
            return;
        }
        axios
            .get<{ featurePdfSuite?: boolean }>("/api/company/features", companyReq)
            .then((r) => setPlanPdfAllowed(!!r.data?.featurePdfSuite))
            .catch(() => setPlanPdfAllowed(false));
    }, [status, isGlobalAdminUser, effectiveCompanyId, companyReq]);

    const [catalogs, setCatalogs] = useState<CatalogRow[]>([]);
    const [catalogId, setCatalogId] = useState<number | null>(null);
    const [pdfId, setPdfId] = useState<number | null>(null);
    const [loadingCatalogs, setLoadingCatalogs] = useState(true);

    const [extractBusy, setExtractBusy] = useState(false);
    const [extractProgress, setExtractProgress] = useState<{ current: number; total: number } | null>(null);
    const [imagesBusy, setImagesBusy] = useState(false);
    const [lastExtractCount, setLastExtractCount] = useState<number | null>(null);
    /** Pagine per richiesta AI (batch); riduce timeout 504 su cataloghi grandi. */
    const [pagesPerBatch, setPagesPerBatch] = useState(6);
    const [useBatchExtract, setUseBatchExtract] = useState(true);
    const [imageProgress, setImageProgress] = useState<{ done: number; total: number } | null>(null);
    const [skipIfHasImages, setSkipIfHasImages] = useState(true);
    const [renderScale, setRenderScale] = useState(2);

    const selectedCatalog = catalogs.find((c) => c.id === catalogId) || null;
    const pdfs = selectedCatalog?.pdfs || [];

    const loadCatalogs = useCallback(async () => {
        if (status !== "authenticated") return;
        setLoadingCatalogs(true);
        try {
            const res = await axios.get<CatalogRow[]>("/api/catalogues", companyReq);
            setCatalogs(res.data || []);
        } catch {
            toast.error("Impossibile caricare i cataloghi");
        } finally {
            setLoadingCatalogs(false);
        }
    }, [status, companyReq]);

    useEffect(() => {
        if (planPdfAllowed === false) {
            setLoadingCatalogs(false);
            return;
        }
        if (planPdfAllowed !== true) return;
        void loadCatalogs();
    }, [loadCatalogs, planPdfAllowed]);

    const handleExtract = async () => {
        if (!catalogId || !pdfId) {
            toast.warning("Seleziona catalogo e PDF");
            return;
        }
        setExtractBusy(true);
        setLastExtractCount(null);
        setExtractProgress(null);
        const batchSize = Math.max(2, Math.min(20, Math.floor(pagesPerBatch) || 6));

        try {
            const meta = await axios.get<{ pageCount?: number }>(
                `/api/repositories/${catalogId}/pdfs/${pdfId}/page-count`,
                { ...companyReq, timeout: 60_000 }
            );
            const totalPages = typeof meta.data?.pageCount === "number" ? meta.data.pageCount : 0;
            if (totalPages <= 0) {
                toast.error("Impossibile leggere il numero di pagine del PDF.");
                return;
            }

            const runOne = async (payload: Record<string, unknown>) => {
                return axios.post<{ success?: boolean; count?: number }>(
                    `/api/repositories/${catalogId}/pdfs/${pdfId}/extract`,
                    payload,
                    { ...companyReq, timeout: 300_000 }
                );
            };

            if (!useBatchExtract || totalPages <= batchSize) {
                const res = await runOne({});
                const n = typeof res.data?.count === "number" ? res.data.count : 0;
                setLastExtractCount(n);
                toast.success(`Estrazione completata: ${n} prodotti in staging (${totalPages} pag.).`);
                return;
            }

            let sum = 0;
            const batches: { from: number; to: number }[] = [];
            for (let from = 1; from <= totalPages; from += batchSize) {
                batches.push({ from, to: Math.min(from + batchSize - 1, totalPages) });
            }
            const nB = batches.length;
            for (let i = 0; i < nB; i++) {
                const { from, to } = batches[i];
                setExtractProgress({ current: i + 1, total: nB });
                const res = await runOne({
                    pageFrom: from,
                    pageTo: to,
                    appendStaging: i > 0,
                    markPdfProcessed: i === nB - 1,
                });
                sum += typeof res.data?.count === "number" ? res.data.count : 0;
                if (i < nB - 1) {
                    await new Promise((r) => setTimeout(r, 450));
                }
            }
            setLastExtractCount(sum);
            toast.success(`Estrazione a batch completata: ${sum} prodotti in staging (${nB} richieste, ${totalPages} pag.).`);
        } catch (e: any) {
            const msg = e?.response?.data?.error || e?.message || "Errore estrazione";
            toast.error(String(msg));
        } finally {
            setExtractBusy(false);
            setExtractProgress(null);
        }
    };

    const handleGenerateImages = async () => {
        if (!catalogId || !pdfId) {
            toast.warning("Seleziona catalogo e PDF");
            return;
        }
        setImagesBusy(true);
        setImageProgress(null);
        try {
            const [stagingRes, pdfRes] = await Promise.all([
                axios.get<StagingProduct[]>(`/api/repositories/${catalogId}/staging`, companyReq),
                fetch(`/api/repositories/${catalogId}/pdfs/${pdfId}/file`, { credentials: "include" }),
            ]);

            if (!pdfRes.ok) {
                toast.error("Impossibile scaricare il PDF");
                return;
            }
            const buf = await pdfRes.arrayBuffer();
            if (!buf || buf.byteLength === 0) {
                toast.error("PDF vuoto");
                return;
            }

            const pdfjsLib = await getPdfjs();
            const loadingTask = pdfjsLib.getDocument({ data: buf });
            const pdf = await loadingTask.promise;

            const products = stagingRes.data || [];
            const targets: { product: StagingProduct; mapping: AiVisualMapping }[] = [];
            for (const p of products) {
                const mapping = parseVisualMapping(p.extraFields);
                if (!mapping) continue;
                if (mapping.pdfId != null && mapping.pdfId !== pdfId) continue;
                if (skipIfHasImages && (p.images?.length || 0) > 0) continue;
                targets.push({ product: p, mapping });
            }

            if (targets.length === 0) {
                toast.info(
                    "Nessun prodotto con mapping visivo per questo PDF (o già con immagini). Esegui prima l’estrazione AI su questo PDF."
                );
                return;
            }

            const pageCache = new Map<number, HTMLCanvasElement>();
            let ok = 0;
            let fail = 0;
            const scale = Math.min(3, Math.max(1, renderScale));

            for (let i = 0; i < targets.length; i++) {
                const { product, mapping } = targets[i];
                setImageProgress({ done: i, total: targets.length });
                try {
                    const pageNum = Math.max(1, Math.floor(mapping.page));
                    let canvas = pageCache.get(pageNum);
                    if (!canvas) {
                        canvas = await renderPdfPageToCanvas(pdf, pageNum, scale);
                        pageCache.set(pageNum, canvas);
                    }
                    const dataUrl = cropViewportCanvasToJpegDataUrl(canvas, mapping.bbox);
                    await axios.post(
                        `/api/repositories/${catalogId}/staging/${product.id}/image-crop`,
                        {
                            dataUrl,
                            page: pageNum,
                            bbox: mapping.bbox,
                            sku: product.sku,
                        },
                        companyReq
                    );
                    ok++;
                } catch (err: any) {
                    console.error("[pdf-ai-studio] crop", product.sku, err);
                    fail++;
                }
            }
            setImageProgress({ done: targets.length, total: targets.length });
            toast.success(`Immagini salvate: ${ok} ok${fail ? `, ${fail} errori` : ""} (file tipo SKU_1.jpg, … come in Import Lab)`);
        } catch (e: any) {
            const msg = e?.response?.data?.error || e?.message || "Errore generazione immagini";
            toast.error(String(msg));
        } finally {
            setImagesBusy(false);
            setImageProgress(null);
        }
    };

    if (status === "loading") {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (status !== "authenticated") {
        return (
            <div className="mx-auto max-w-lg p-8 text-center text-slate-600">
                Accedi per usare PDF AI Studio.
            </div>
        );
    }

    if (planPdfAllowed === false) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">PDF AI Studio</p>
                <h1 className="text-2xl font-black text-slate-900 mt-2">Modulo non incluso nel piano</h1>
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                    Il tenant corrente non ha PDF AI Studio attivo. Chiedi all&apos;amministratore globale di abilitarlo
                    da Piattaforma &amp; piani.
                </p>
                <Link href="/admin/platform" className="inline-block mt-6 text-orange-600 font-black hover:underline">
                    Apri Piattaforma &amp; piani
                </Link>
            </div>
        );
    }

    if (planPdfAllowed === null && !isGlobalAdminUser) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <Link href="/" className="hover:text-slate-800">
                    Home
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span>PDF AI Studio</span>
            </div>

            <header className="mb-8">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-indigo-600 p-3 text-white shadow-sm">
                        <Scissors className="h-7 w-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">PDF AI Studio</h1>
                        <p className="mt-1 text-slate-600">
                            Estrazione catalogo con AI (SKU, titoli, descrizioni, extra) e ritaglio immagini dal PDF in
                            base ai bounding box — i file seguono la convenzione{" "}
                            <code className="rounded bg-slate-100 px-1 text-sm">SKU_1.jpg</code>,{" "}
                            <code className="rounded bg-slate-100 px-1 text-sm">SKU_2.jpg</code> come in Import Lab.
                        </p>
                    </div>
                </div>
            </header>

            <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Catalogo</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                        disabled={loadingCatalogs}
                        value={catalogId ?? ""}
                        onChange={(e) => {
                            const v = e.target.value ? parseInt(e.target.value, 10) : null;
                            setCatalogId(v);
                            setPdfId(null);
                            setLastExtractCount(null);
                        }}
                    >
                        <option value="">— Seleziona —</option>
                        {catalogs.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} (id {c.id})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">PDF</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                        disabled={!catalogId || pdfs.length === 0}
                        value={pdfId ?? ""}
                        onChange={(e) => {
                            const v = e.target.value ? parseInt(e.target.value, 10) : null;
                            setPdfId(v);
                            setLastExtractCount(null);
                        }}
                    >
                        <option value="">{pdfs.length ? "— Seleziona PDF —" : "Nessun PDF su questo catalogo"}</option>
                        {pdfs.map((p) => (
                            <option key={p.id} value={p.id}>
                                {(p.fileName || `PDF ${p.id}`) + ` (id ${p.id})`}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                    <div className="flex gap-2">
                        <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            L’estrazione <strong>svuota lo staging</strong> al primo batch, poi <strong>aggiunge</strong>{" "}
                            i prodotti dei batch successivi (SKU già presenti vengono saltati). Le immagini si generano
                            nel browser; servono chiavi Gemini/OpenAI. L’opzione batch invia più richieste più piccole
                            per ridurre timeout (504) e carico per richiesta.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Estrazione AI — batch pagine</p>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={useBatchExtract}
                            onChange={(e) => setUseBatchExtract(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Dividi il PDF in batch (consigliato se il catalogo è grande)
                    </label>
                    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        Pagine per richiesta
                        <input
                            type="number"
                            min={2}
                            max={20}
                            value={pagesPerBatch}
                            onChange={(e) => setPagesPerBatch(parseInt(e.target.value, 10) || 6)}
                            className="w-20 rounded border border-slate-300 px-2 py-1"
                        />
                        <span className="text-xs text-slate-500">(2–20; es. 6 = meno carico per chiamata)</span>
                    </label>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={skipIfHasImages}
                            onChange={(e) => setSkipIfHasImages(e.target.checked)}
                            className="rounded border-slate-300"
                        />
                        Salta prodotti che hanno già immagini in staging
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        Scala rendering
                        <select
                            className="rounded border border-slate-300 px-2 py-1"
                            value={String(renderScale)}
                            onChange={(e) => setRenderScale(parseInt(e.target.value, 10) || 2)}
                        >
                            <option value="1">1×</option>
                            <option value="2">2×</option>
                            <option value="3">3×</option>
                        </select>
                    </label>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row">
                    <button
                        type="button"
                        disabled={!catalogId || !pdfId || extractBusy}
                        onClick={() => void handleExtract()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {extractBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                        1. Estrai prodotti (AI)
                    </button>
                    <button
                        type="button"
                        disabled={!catalogId || !pdfId || imagesBusy}
                        onClick={() => void handleGenerateImages()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {imagesBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                        2. Genera immagini da bbox
                    </button>
                </div>

                {extractProgress && (
                    <p className="text-sm font-medium text-indigo-700">
                        Batch estrazione: {extractProgress.current} / {extractProgress.total}…
                    </p>
                )}

                {lastExtractCount != null && (
                    <p className="text-sm text-slate-600">
                        Ultima estrazione: <strong>{lastExtractCount}</strong> prodotti importati in staging.
                    </p>
                )}

                {imageProgress && (
                    <p className="text-sm text-slate-600">
                        Immagini: {imageProgress.done} / {imageProgress.total}…
                    </p>
                )}
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
                Per revisione manuale singolo prodotto usa{" "}
                <Link href="/?tab=import" className="text-indigo-600 underline hover:text-indigo-800">
                    Import Lab
                </Link>
                .
            </p>
        </div>
    );
}

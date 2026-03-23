"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
    Package, FileText, Search, Plus, Trash2, ImageIcon,
    CheckCircle2, ChevronRight, ChevronLeft, LayoutGrid,
    List, Sparkles, Box, Database, HardDrive, Cpu,
    Layers, X, Maximize2, Globe, RefreshCw, AlertCircle,
    FileSpreadsheet, Image as ImageIconLucide, Scissors,
    Wand2, ScanSearch, ExternalLink, Check, Save
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { toast } from "react-toastify";
import { useCompanyContext } from "@/contexts/CompanyContext";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import { useCatalog } from "./CatalogContext";
import PdfVisualWorkspace from "./PdfVisualWorkspace";

if (typeof window !== "undefined") {
    // Robust CDN for ESM-based PDF.js workers
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface StagingProduct {
    id: number;
    sku: string;
    ean?: string;
    parentSku?: string;
    brand?: string;
    category?: string;
    texts: any[];
    prices: any[];
    images: any[];
    extraFields: any[];
    foundInPdf?: { pageNumber: number, pdfId: number }[];
}

/** Allineato a staging/route.ts per confronti SKU/EAN */
function normalizeStagingSku(v: unknown): string {
    return (v ? String(v).trim().toUpperCase() : "") || "";
}
function normalizeStagingEan(v: unknown): string {
    return (v ? String(v).replace(/[^\d]/g, "") : "") || "";
}

export type ImportLabReport = {
    at: string;
    fileName: string;
    stats: Record<string, number | string | undefined>;
    duplicatesInBatch: { skuCounts: Record<string, number>; eanCounts: Record<string, number> };
    clientRows: { totalDataRows: number; sentWithKey: number; skippedNoKeyOnClient: number };
};

const ensureColorTemplate = (templates: { id: number; key: string; label: string }[]) => {
    const hasColor = templates.some((tpl) => String(tpl.key || "").toLowerCase() === "colore");
    if (hasColor) return templates;
    return [...templates, { id: -1, key: "colore", label: "COLORE" }];
};

// Helper component to render a single PDF page thumbnail (cancels previous render to avoid canvas conflict)
const PdfPageThumbnail = ({ pageNumber, pdfDoc }: { pageNumber: number, pdfDoc: any }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !pdfDoc) return;
        let cancelled = false;

        const renderPage = async () => {
            try {
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }
                const page = await pdfDoc.getPage(pageNumber);
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 0.4 });
                const canvas = canvasRef.current;
                if (!canvas || cancelled) return;
                const context = canvas.getContext("2d");
                if (!context) return;
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                const task = page.render({ canvasContext: context, viewport });
                renderTaskRef.current = task;
                await task.promise;
                if (!cancelled) renderTaskRef.current = null;
            } catch (err: any) {
                if (err?.name !== "RenderingCancelledException") {
                    console.error("Error rendering thumbnail:", err);
                }
            }
        };
        renderPage();
        return () => {
            cancelled = true;
            if (renderTaskRef.current) {
                try { renderTaskRef.current.cancel(); } catch (_) {}
                renderTaskRef.current = null;
            }
        };
    }, [pageNumber, pdfDoc]);

    return (
        <canvas ref={canvasRef} className="w-full h-full object-contain rounded-lg shadow-sm" />
    );
};

export default function ImportLab() {
    const searchParams = useSearchParams();
    const catalogIdParam = searchParams.get("id");

    const [repository, setRepository] = useState<any>(null);
    const [allRepositories, setAllRepositories] = useState<any[]>([]);
    const [products, setProducts] = useState<StagingProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<StagingProduct | null>(null);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);

    // PDF Viewer States
    const [pdfPages, setPdfPages] = useState<any[]>([]);
    const [pdfInstance, setPdfInstance] = useState<any>(null);
    const [currentPdfIdx, setCurrentPdfIdx] = useState(0);
    const [isSearchingPdf, setIsSearchingPdf] = useState(false);

    // File Import States
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[][]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({
        sku: "",
        ean: "",
        parentSku: "",
        title: "",
        description: "",
        shortDescription: "",
        bulletPoints: "",
        price: "",
        brand: "",
        category: "",
        dimensions: "",
        weight: "",
        material: "",
        seoText: "",
        stockLocal: "",
        stockSupplier: "",
    });
    const [extraFieldTemplates, setExtraFieldTemplates] = useState<{ id: number; key: string; label: string }[]>([]);
    const [extraFieldMapping, setExtraFieldMapping] = useState<Record<string, string>>({});
    const [newExtraLabel, setNewExtraLabel] = useState<string>("");
    /** Nuovo campo extra nella scheda Import (staging) */
    const [importSheetNewExtraKey, setImportSheetNewExtraKey] = useState("");
    const [importSheetNewExtraValue, setImportSheetNewExtraValue] = useState("");
    const [overwriteBaseInfo, setOverwriteBaseInfo] = useState(true);
    const [overwriteTexts, setOverwriteTexts] = useState(true);
    const [overwritePrice, setOverwritePrice] = useState(true);
    const [overwriteExtras, setOverwriteExtras] = useState(true);
    const [currentImportFile, setCurrentImportFile] = useState<string>("");
    const [isSavingStaging, setIsSavingStaging] = useState(false);
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);
    const [isExtractingAi, setIsExtractingAi] = useState(false);
    const [pdfSummary, setPdfSummary] = useState<{ summary?: string; pageCount?: number; sections?: string[] } | null>(null);
    const [pdfSummaryLoading, setPdfSummaryLoading] = useState(false);
    const [askQuestion, setAskQuestion] = useState("");
    const [askAnswer, setAskAnswer] = useState<string | null>(null);
    const [askLoading, setAskLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // V4 DISMANTLER STATES
    const [isVisualMode, setIsVisualMode] = useState(false);
    const [selectedMapping, setSelectedMapping] = useState<any | null>(null);
    const [bulkField, setBulkField] = useState<"brand" | "category" | "stockLocal" | "stockSupplier">("brand");
    const [bulkValue, setBulkValue] = useState<string>("");
    const [bulkOnlyEmpty, setBulkOnlyEmpty] = useState<boolean>(true);
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [bulkTitleSearch, setBulkTitleSearch] = useState<string>("");
    const [bulkTitleReplace, setBulkTitleReplace] = useState<string>("");
    const [isBulkTitleUpdating, setIsBulkTitleUpdating] = useState(false);
    const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
    const [imagePickerItems, setImagePickerItems] = useState<{ fileName: string; relativePath: string; url: string }[]>([]);
    const [imagePickerLoading, setImagePickerLoading] = useState(false);
    const [imagePickerSelection, setImagePickerSelection] = useState<string[]>([]);
    const companyContext = useCompanyContext();

    // Conferma push verso Master ERP
    const [isPushConfirmOpen, setIsPushConfirmOpen] = useState(false);
    const [pushOverwriteBrand, setPushOverwriteBrand] = useState(false);
    const [pushOverwriteCategory, setPushOverwriteCategory] = useState(false);
    const [pushOverwriteEan, setPushOverwriteEan] = useState(false);
    const [pushOverwriteParentSku, setPushOverwriteParentSku] = useState(false);
    const [pushOverwriteTitle, setPushOverwriteTitle] = useState(false);
    const [pushOverwriteLongDesc, setPushOverwriteLongDesc] = useState(false);
    const [pushOverwriteBullets, setPushOverwriteBullets] = useState(false);
    const [pushOverwriteSeo, setPushOverwriteSeo] = useState(false);
    const [pushOverwritePrice, setPushOverwritePrice] = useState(false);
    const [pushOverwriteExtras, setPushOverwriteExtras] = useState(false);
    const [pushOverwriteStockLocal, setPushOverwriteStockLocal] = useState(false);
    const [pushOverwriteStockSupplier, setPushOverwriteStockSupplier] = useState(false);
    const [pushOverwriteImages, setPushOverwriteImages] = useState(false);

    const [lastImportReport, setLastImportReport] = useState<ImportLabReport | null>(null);
    const [showImportReportPanel, setShowImportReportPanel] = useState(true);
    const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);

    /** Duplicati SKU/EAN nel listino staging corrente (stesso DB) */
    const stagingDuplicateSets = useMemo(() => {
        const skuOcc = new Map<string, number>();
        const eanOcc = new Map<string, number>();
        for (const p of products) {
            const sn = normalizeStagingSku(p.sku);
            const en = normalizeStagingEan(p.ean);
            if (sn) skuOcc.set(sn, (skuOcc.get(sn) || 0) + 1);
            if (en) eanOcc.set(en, (eanOcc.get(en) || 0) + 1);
        }
        const dupSku = new Set<string>();
        const dupEan = new Set<string>();
        for (const [k, c] of skuOcc) {
            if (c > 1) dupSku.add(k);
        }
        for (const [k, c] of eanOcc) {
            if (c > 1) dupEan.add(k);
        }
        return { dupSku, dupEan };
    }, [products]);

    const stagingRowDuplicateFlags = (p: StagingProduct) => {
        const sn = normalizeStagingSku(p.sku);
        const en = normalizeStagingEan(p.ean);
        return {
            skuDup: Boolean(sn && stagingDuplicateSets.dupSku.has(sn)),
            eanDup: Boolean(en && stagingDuplicateSets.dupEan.has(en)),
        };
    };

    const filteredProducts = useMemo(() => {
        const q = (searchTerm || "").trim().toLowerCase();
        if (!q) return products;

        return products.filter((p) => {
            const sku = String(p.sku || "").toLowerCase();
            const ean = String(p.ean || "").toLowerCase();
            const brand = String(p.brand || "").toLowerCase();
            const category = String(p.category || "").toLowerCase();
            const title = String(p.texts?.[0]?.title || "").toLowerCase();

            return (
                sku.includes(q) ||
                ean.includes(q) ||
                brand.includes(q) ||
                category.includes(q) ||
                title.includes(q)
            );
        });
    }, [products, searchTerm]);

    const tableProducts = useMemo(() => {
        if (!showOnlyDuplicates) return filteredProducts;
        return filteredProducts.filter((p) => {
            const sn = normalizeStagingSku(p.sku);
            const en = normalizeStagingEan(p.ean);
            if (sn && stagingDuplicateSets.dupSku.has(sn)) return true;
            if (en && stagingDuplicateSets.dupEan.has(en)) return true;
            return false;
        });
    }, [filteredProducts, showOnlyDuplicates, stagingDuplicateSets]);

    useEffect(() => {
        if (!catalogIdParam) {
            setLastImportReport(null);
            return;
        }
        try {
            const raw = sessionStorage.getItem("importLab_lastReport_" + catalogIdParam);
            if (raw) setLastImportReport(JSON.parse(raw) as ImportLabReport);
        } catch {
            /* ignore */
        }
    }, [catalogIdParam]);

    useEffect(() => {
        if (catalogIdParam) {
            fetchRepository(parseInt(catalogIdParam));
        } else {
            fetchAllRepositories();
        }
    }, [catalogIdParam, companyContext?.selectedCompanyId]);

    // Handle PDF switching
    useEffect(() => {
        if (repository?.pdfs?.length > 0 && repository.pdfs[currentPdfIdx]) {
            console.log("[PDF-SWITCH] Loading PDF index " + currentPdfIdx + ": " + repository.pdfs[currentPdfIdx].fileName);
            loadPdfPages(repository.pdfs[currentPdfIdx].id);
        }
    }, [currentPdfIdx, repository?.pdfs]);

    const fetchAllRepositories = async () => {
        setLoading(true);
        try {
            const res = await axios.get("/api/catalogues");
            setAllRepositories(res.data);
        } catch (err) {
            toast.error("Errore nel caricamento dei repository");
        } finally {
            setLoading(false);
        }
    };

    const fetchRepository = async (id: number) => {
        if (id == null || isNaN(id)) return;
        // Se la scheda prodotto è aperta, dopo il refresh vogliamo ricaricare anche i campi correnti.
        const currentSelectedId = selectedProduct?.id;
        setLoading(true);
        try {
            const [repoRes, productsRes, extraFieldsRes] = await Promise.all([
                axios.get("/api/catalogues/" + id),
                axios.get("/api/repositories/" + id + "/staging"),
                axios.get("/api/catalogues/" + id + "/extra-fields")
            ]);
            setRepository(repoRes.data);
            setProducts(productsRes.data);
            setExtraFieldTemplates(ensureColorTemplate(extraFieldsRes.data || []));

            // Evita "stale UI": se il prodotto in modal è quello ricaricato, sostituiscilo con i dati aggiornati dal backend.
            if (currentSelectedId) {
                const updatedSelected = (productsRes.data as StagingProduct[]).find(p => p.id === currentSelectedId);
                if (updatedSelected) setSelectedProduct(updatedSelected);
            }

            // If there are PDFs, load the first one's pages if needed
            if (repoRes.data.pdfs?.length > 0) {
                loadPdfPages(repoRes.data.pdfs[0].id);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            toast.error("Errore nel caricamento del repository");
        } finally {
            setLoading(false);
        }
    };

    const loadPdfPages = async (pdfId: number, retry = false) => {
        if (!catalogIdParam || !pdfId) return;

        const url = "/api/repositories/" + catalogIdParam + "/pdfs/" + pdfId + "/file";
        try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) {
                const text = await res.text();
                console.warn("[PDF-LOAD] Server responded with", res.status, text?.slice(0, 100));
                if (res.status === 422) {
                    toast.error("Il file non è un PDF valido. Prova a ricaricarlo dalla sezione PDF (menu).");
                } else {
                    toast.error("PDF non trovato (404). Carica il file dalla sezione PDF o Import Lab.");
                }
                return;
            }
            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("application/pdf")) {
                toast.error("Il server non ha restituito un PDF.");
                return;
            }
            const arrayBuffer = await res.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                toast.error("File vuoto. Ricarica il PDF dalla sezione PDF.");
                return;
            }
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            setPdfInstance(pdf);
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pages.push({ pageNumber: i });
            }
            setPdfPages(pages);
            console.log("[PDF-LOAD] Success: " + pdf.numPages + " pages.");
        } catch (err: any) {
            console.error("PDF Load Error:", err);
            const msg = (err?.message || err?.toString?.() || "").toLowerCase();
            const name = (err?.name || "").toString();
            const isStructureError =
                name === "InvalidPDFException" ||
                msg.includes("invalid pdf") ||
                msg.includes("invalid pdf structure") ||
                (msg.length <= 3 && msg.length > 0);
            if (msg.includes("fetch") || msg.includes("failed") || msg.includes("network")) {
                toast.error("Errore di rete. Verifica che il server sia raggiungibile.");
            } else if (isStructureError) {
                if (!retry) {
                    loadPdfPages(pdfId, true);
                    return;
                }
                toast.error("Questo PDF non può essere aperto nel viewer. Caricalo dalla sezione PDF (menu) per normalizzarlo, oppure usa un altro file.");
            } else {
                toast.error("Errore nel caricamento del PDF. Prova dalla sezione PDF.");
            }
        }
    };

    const getExtra = (p: StagingProduct, key: string): string => {
        const k = key.toLowerCase();
        const ex = (p.extraFields || []).find((e: any) => String(e.key || "").toLowerCase() === k);
        return ex?.value ?? "";
    };
    const setExtra = (p: StagingProduct, key: string, value: string): void => {
        const extra = [...(p.extraFields || [])];
        const k = key.toLowerCase();
        const i = extra.findIndex((e: any) => String(e.key || "").toLowerCase() === k);
        if (i >= 0) extra[i] = { ...extra[i], key, value };
        else extra.push({ key, value });
        const updated = { ...p, extraFields: extra };
        setSelectedProduct(updated);
        // Il push Master ERP itera su `products`: senza questo sync i campi extra restano obsoleti finché non salvi.
        setProducts((prev) => prev.map((prod) => (prod.id === p.id ? updated : prod)));
    };

    const handleSaveProductChange = async () => {
        if (!selectedProduct || !catalogIdParam) return;

        const toastId = toast.loading("Salvataggio modifiche...");
        try {
            const payload = {
                ...selectedProduct,
                listName: repository?.lastListinoName || "default"
            };
            await axios.put("/api/repositories/" + catalogIdParam + "/staging/" + selectedProduct.id, payload);
            toast.update(toastId, { render: "Prodotto aggiornato!", type: "success", isLoading: false, autoClose: 2000 });
            fetchRepository(parseInt(catalogIdParam));
            setIsProductModalOpen(false);
        } catch (err: any) {
            toast.update(toastId, { render: "Errore nel salvataggio", type: "error", isLoading: false, autoClose: 3000 });
        }
    };

    const handleBulkStagingUpdate = async () => {
        if (!catalogIdParam) {
            toast.warning("Seleziona prima un repository per applicare modifiche massime.");
            return;
        }
        if (!bulkValue.trim()) {
            toast.warning("Inserisci un valore da applicare.");
            return;
        }
        if (!products.length) {
            toast.info("Non ci sono prodotti in staging su cui applicare la modifica.");
            return;
        }

        const label =
            bulkField === "brand"
                ? "Brand"
                : bulkField === "category"
                ? "Categoria"
                : bulkField === "stockLocal"
                ? "Magazzino interno"
                : "Magazzino fornitore";
        if (!confirm("Applicare il valore \"" + bulkValue.trim() + "\" al campo " + label + " su " + products.length + " prodotti" + (bulkOnlyEmpty ? " solo dove vuoto" : "") + "?")) {
            return;
        }

        setIsBulkUpdating(true);
        const toastId = toast.loading("Applicazione modifica massiva in corso...");
        try {
            const res = await axios.post("/api/repositories/" + catalogIdParam + "/staging/bulk", {
                field: bulkField,
                value: bulkValue,
                onlyEmpty: bulkOnlyEmpty,
            });

            toast.update(toastId, {
                render: "Aggiornati " + (res.data.updatedCount || 0) + " prodotti in staging.",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });

            // Ricarica i dati del repository per vedere le modifiche
            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            console.error("Bulk staging update error:", err);
            toast.update(toastId, {
                render: "Errore durante l'aggiornamento massivo.",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        } finally {
            setIsBulkUpdating(false);
        }
    };

    const handleBulkTitleUpdate = async () => {
        if (!catalogIdParam) {
            toast.warning("Seleziona prima un repository per applicare modifiche ai titoli.");
            return;
        }
        if (!bulkTitleReplace.trim()) {
            toast.warning("Inserisci il testo da inserire nel titolo.");
            return;
        }
        if (!products.length) {
            toast.info("Non ci sono prodotti in staging su cui applicare la modifica al titolo.");
            return;
        }

        const msgBase = bulkTitleSearch
            ? `Sostituire "${bulkTitleSearch}" con "${bulkTitleReplace}" nei titoli e aggiungerlo se non presente`
            : `Aggiungere "${bulkTitleReplace}" ai titoli dove non presente`;

        if (!confirm(msgBase + " per " + products.length + " prodotti?")) {
            return;
        }

        setIsBulkTitleUpdating(true);
        const toastId = toast.loading("Aggiornamento massivo dei titoli in corso...");
        try {
            const res = await axios.post("/api/repositories/" + catalogIdParam + "/staging/bulk-title", {
                search: bulkTitleSearch,
                replace: bulkTitleReplace,
            });

            toast.update(toastId, {
                render: "Aggiornati " + (res.data.updatedCount || 0) + " titoli prodotti.",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });

            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            console.error("Bulk title update error:", err);
            toast.update(toastId, {
                render: "Errore durante l'aggiornamento massivo dei titoli.",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsBulkTitleUpdating(false);
        }
    };

    const openImagePicker = async () => {
        if (!catalogIdParam || !selectedProduct) {
            toast.warning("Seleziona un prodotto del repository prima di aggiungere immagini.");
            return;
        }

        setIsImagePickerOpen(true);
        setImagePickerLoading(true);
        setImagePickerItems([]);
        setImagePickerSelection([]);

        try {
            const res = await axios.get("/api/repositories/" + catalogIdParam + "/images", {
                params: { sku: selectedProduct.sku }
            });
            const imgs = Array.isArray(res.data?.images) ? res.data.images : [];
            setImagePickerItems(imgs);
        } catch (err) {
            console.error("Image picker load error:", err);
            toast.error("Errore nel caricamento immagini dalla cartella.");
        } finally {
            setImagePickerLoading(false);
        }
    };

    const handleConfirmImagePicker = async () => {
        if (!catalogIdParam || !selectedProduct) {
            setIsImagePickerOpen(false);
            return;
        }
        if (imagePickerSelection.length === 0) {
            setIsImagePickerOpen(false);
            return;
        }

        const toastId = toast.loading("Associazione immagini in corso...");
        try {
            const productId = selectedProduct.id;
            const addedImages: any[] = [];

            for (const rel of imagePickerSelection) {
                const item = imagePickerItems.find(i => i.relativePath === rel);
                if (!item) continue;
                const payload = { imageUrl: item.url };
                try {
                    const res = await axios.post("/api/repositories/" + catalogIdParam + "/staging/" + productId + "/images", payload);
                    const imgRec = res.data?.image;
                    if (imgRec) {
                        addedImages.push(imgRec);
                    }
                } catch (e) {
                    console.error("Attach single image error:", e);
                }
            }

            if (addedImages.length > 0) {
                setSelectedProduct(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        images: [...prev.images, ...addedImages]
                    };
                });
            }

            toast.update(toastId, {
                render: "Associate " + addedImages.length + " immagini al prodotto.",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
        } catch (err) {
            console.error("Confirm image picker error:", err);
            toast.update(toastId, {
                render: "Errore durante l'associazione immagini.",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        } finally {
            setIsImagePickerOpen(false);
        }
    };

    const handlePushToMasterErp = () => {
        if (!catalogIdParam) {
            toast.warning("Apri prima un repository specifico per poter fare il push verso il Master ERP.");
            return;
        }
        if (products.length === 0) {
            toast.info("Nessun prodotto in staging da inviare al Master ERP.");
            return;
        }

        // Apri sempre il modale di conferma con scelta dei campi da sovrascrivere
        setPushOverwriteBrand(false);
        setPushOverwriteCategory(false);
        setPushOverwriteEan(false);
        setPushOverwriteParentSku(false);
        setPushOverwriteTitle(false);
        setPushOverwriteLongDesc(false);
        setPushOverwriteBullets(false);
        setPushOverwriteSeo(false);
        setPushOverwritePrice(false);
        // Default on: di solito si vuole portare in Master ERP anche dimensioni/peso/materiali/colore ecc.
        setPushOverwriteExtras(true);
        setPushOverwriteStockLocal(false);
        setPushOverwriteStockSupplier(false);
        setIsPushConfirmOpen(true);
    };

    const executePushToMasterErp = async () => {
        if (!catalogIdParam) return;
        if (products.length === 0) return;

        const toastId = toast.loading("Invio prodotti al Master ERP in corso...");
        let successCount = 0;
        let errorCount = 0;

        try {
            for (const p of products) {
                try {
                    const baseText = (p.texts && p.texts[0]) || {};
                    const basePrice = (p.prices && p.prices[0]) || {};

                    // Master ERP richiede SKU univoco: se manca o è NO-SKU usiamo EAN o id staging
                    const rawSku = (p.sku || "").toString().trim();
                    const effectiveSku = (rawSku && rawSku !== "NO-SKU")
                        ? rawSku
                        : (p.ean ? `EAN-${String(p.ean).trim()}` : `STG-${p.id}`);

                    // Separiamo lo stock dagli altri campi extra, così la checkbox
                    // "Campi extra" non sovrascrive anche `stockLocal/stockSupplier`.
                    const extraObj: Record<string, string> = {};
                    const stockObj: Record<string, string> = {};
                    (p.extraFields || []).forEach((ex: any) => {
                        if (!ex.key) return;
                        const key = String(ex.key);
                        const val = ex.value?.toString() ?? "";
                        if (key === "stockLocal" || key === "stockSupplier") {
                            stockObj[key] = val;
                        } else {
                            extraObj[key] = val;
                        }
                    });

                    const extraFieldsToSend: Record<string, string> = {};
                    if (pushOverwriteExtras) {
                        Object.assign(extraFieldsToSend, extraObj);
                    }
                    if (pushOverwriteStockLocal && stockObj.stockLocal !== undefined) {
                        extraFieldsToSend.stockLocal = stockObj.stockLocal;
                    }
                    if (pushOverwriteStockSupplier && stockObj.stockSupplier !== undefined) {
                        extraFieldsToSend.stockSupplier = stockObj.stockSupplier;
                    }

                    const images = (p.images || []).map((img: any) => ({
                        url: img.imageUrl || img.url
                    }));

                    await axios.post("/api/products", {
                        sku: effectiveSku,
                        ean: p.ean,
                        parentSku: p.parentSku,
                        brand: (repository?.brandRef?.name ?? p.brand) || undefined,
                        brandId: repository?.brandId ?? undefined,
                        category: p.category,
                        title: baseText.title,
                        description: baseText.description,
                        docDescription: baseText.docDescription,
                        bulletPoints: baseText.bulletPoints,
                        seoAiText: baseText.seoAiText,
                        price: basePrice.price,
                        images,
                        // Anche i campi legacy top-level: l’API li mappa in ProductExtra insieme a extraFields
                        ...(pushOverwriteExtras
                            ? {
                                  dimensions: extraObj.dimensions,
                                  weight: extraObj.weight,
                                  material: extraObj.material
                              }
                            : {}),
                        extraFields: extraFieldsToSend,
                        catalogId: parseInt(catalogIdParam),
                        overwrite: {
                            brand: pushOverwriteBrand,
                            category: pushOverwriteCategory,
                            ean: pushOverwriteEan,
                            parentSku: pushOverwriteParentSku,
                            title: pushOverwriteTitle,
                            longDescription: pushOverwriteLongDesc,
                            bulletPoints: pushOverwriteBullets,
                            seoAiText: pushOverwriteSeo,
                            price: pushOverwritePrice,
                            extras: pushOverwriteExtras || pushOverwriteStockLocal || pushOverwriteStockSupplier,
                            images: pushOverwriteImages,
                        },
                    });

                    successCount++;
                } catch (err) {
                    console.error("Push singolo prodotto fallito:", err);
                    errorCount++;
                }
            }

            toast.update(toastId, {
                render: "Push completato: " + successCount + " prodotti sincronizzati, " + errorCount + " errori.",
                type: errorCount > 0 ? "warning" : "success",
                isLoading: false,
                autoClose: 4000
            });
            setIsPushConfirmOpen(false);
        } catch (err: any) {
            console.error("Push Master ERP error:", err);
            toast.update(toastId, {
                render: "Errore durante il push verso il Master ERP.",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        }
    };

    // Recursive Image Association (Batch Mode)
    const handleFolderImageAssociation = async () => {
        if (!repository?.imageFolderPath || !catalogIdParam) {
            toast.warning("Configura il percorso cartella immagini nelle impostazioni repository.");
            return;
        }

        const toastId = toast.loading("Ricerca immagini da cartella (Recursive Scan)...");

        try {
            const res = await axios.post("/api/repositories/" + catalogIdParam + "/associate-images");

            if (res.data.success) {
                toast.update(toastId, {
                    render: "Associazione completata: " + res.data.count + " immagini associate con successo dalla cartella.",
                    type: "success",
                    isLoading: false,
                    autoClose: 3000
                });

                // Refresh the list to show new images
                fetchRepository(parseInt(catalogIdParam));
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || "Errore durante l'associazione immagini.";
            toast.update(toastId, {
                render: errorMsg,
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        }
    };

    // PDF Image Association (Placeholder/Basic Logic)
    const handlePdfImageAssociation = async () => {
        if (!repository?.pdfs?.length || products.length === 0) {
            toast.warning("Carica almeno un PDF e un listino per iniziare.");
            return;
        }

        const toastId = toast.loading("Estrazione immagini dai PDF in corso...");
        setIsSearchingPdf(true);

        try {
            let associationsCount = 0;
            const updatedProducts = [...products];

            for (const pdf of repository.pdfs) {
                const cleanPath = pdf.filePath.startsWith('/') ? pdf.filePath : "/" + pdf.filePath;
                const finalUrl = cleanPath;

                const loadingTask = pdfjsLib.getDocument({
                    url: finalUrl,
                    withCredentials: true,
                    disableRange: true
                });
                const pdfDoc = await loadingTask.promise;

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map((item: any) => item.str).join(" ").toLowerCase();

                    const skusInPage = updatedProducts.filter(p => p.sku && pageText.includes(p.sku.toLowerCase()));

                    if (skusInPage.length > 0) {
                        // Render page to canvas
                        const viewport = page.getViewport({ scale: 1.5 });
                        const canvas = document.createElement("canvas");
                        const context = canvas.getContext("2d");
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: context!, viewport }).promise;
                        const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);

                        for (const product of skusInPage) {
                            try {
                                await axios.post("/api/repositories/" + catalogIdParam + "/staging-image", {
                                    stagingProductId: product.id,
                                    imageUrl: imageDataUrl
                                });
                                associationsCount++;
                            } catch (e) {
                                console.error("Failed to associate image for SKU", product.sku);
                            }
                        }
                    }
                }
            }

            fetchRepository(parseInt(catalogIdParam!));
            toast.update(toastId, {
                render: "Associazione PDF completata: " + associationsCount + " immagini associate.",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
        } catch (err: any) {
            console.error("PDF Image Association error:", err);
            toast.update(toastId, { render: "Errore durante l'associazione immagini da PDF.", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsSearchingPdf(false);
        }
    };

    // Text Normalization & Sanitization
    const normalizeText = (text: any) => {
        if (text === null || text === undefined) return null;
        let s = String(text);

        // Strip invisible characters and BOM
        s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");

        // Normalize whitespace (including non-breaking spaces)
        s = s.replace(/\s+/g, ' ').trim();

        // Optional: Heuristic fix for Mojibake if still detected
        // UTF-8 à is C3 A0. If it became Ã plus non-breaking space (A0), we fix it.
        // This is a safety net for "double mangled" data.
        if (s.includes('Ã\u00A0')) s = s.replace(/Ã\u00A0/g, 'à');
        if (s.includes('Ã©')) s = s.replace(/Ã©/g, 'é');
        if (s.includes('Ã¹')) s = s.replace(/Ã¹/g, 'ù');
        if (s.includes('Ã²')) s = s.replace(/Ã²/g, 'ò');
        if (s.includes('Ã¬')) s = s.replace(/Ã¬/g, 'ì');
        if (s.includes('â\u00AC')) s = s.replace(/â\u00AC/g, '€');

        return s;
    };

    // File Upload Handler
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const buffer = evt.target?.result;
            if (!buffer) return;

            let wb;
            try {
                // Advanced detection for CSV encoding
                if (file.name.toLowerCase().endsWith('.csv')) {
                    // Try to decode as UTF-8 first
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(new Uint8Array(buffer as ArrayBuffer));
                    wb = XLSX.read(text, { type: 'string' });
                } else {
                    // For Excel files, use buffer with UTF-8 hint
                    wb = XLSX.read(buffer, { type: "array", codepage: 65001 });
                }
            } catch (err) {
                console.error("Encoding detection error, falling back:", err);
                wb = XLSX.read(buffer, { type: "array" });
            }

            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];

            // Raw data extraction with forced string conversion to preserve precision
            const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

            if (rawData.length > 0) {
                const headers = (rawData[0] as any[]).map(h => normalizeText(h) || "");
                const rows = rawData.slice(1).map((row: any) =>
                    (row as any[]).map(cell => normalizeText(cell))
                );

                setCurrentImportFile(file.name);
                setRawHeaders(headers);
                setRawRows(rows);
                setIsImportModalOpen(true);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDeletePdf = async (pdfId: number) => {
        if (!window.confirm("Sei sicuro di voler eliminare questo PDF?")) return;

        try {
            await axios.delete("/api/repositories/" + catalogIdParam + "/pdfs/" + pdfId);
            toast.success("PDF eliminato con successo");
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err: any) {
            toast.error("Errore durante l'eliminazione del PDF");
        }
    };
    const handleClearStaging = async () => {
        if (!window.confirm("Sei sicuro di voler svuotare il listino? Tutti i dati non salvati andranno persi.")) return;

        try {
            await axios.delete("/api/repositories/" + catalogIdParam + "/staging");
            setLastImportReport(null);
            try {
                sessionStorage.removeItem("importLab_lastReport_" + catalogIdParam);
            } catch {
                /* ignore */
            }
            toast.success("Listino rimosso con successo");
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err: any) {
            toast.error("Errore durante la rimozione del listino");
        }
    };

    const handleClearStagingForRepo = async (repoId: number) => {
        if (!window.confirm("Sei sicuro di voler svuotare il listino di questo repository?")) return;
        try {
            await axios.delete("/api/repositories/" + repoId + "/staging");
            toast.success("Listino rimosso");
            fetchAllRepositories();
        } catch (err) {
            toast.error("Errore");
        }
    };

    const handleConfirmImport = async () => {
        if (!catalogIdParam) {
            toast.warning("Nessun catalogo selezionato. Apri un catalogo dalla dashboard.");
            return;
        }
        const hasKeyMapping = mapping.sku || mapping.ean;
        if (!hasKeyMapping) {
            toast.warning("Devi mappare almeno la colonna SKU e/o EAN (unici campi usati per unire le righe).");
            return;
        }

        setIsSavingStaging(true);
        const toastId = toast.loading("Salvataggio dati in corso...");

        try {
            const productsToImport = rawRows.map(row => {
                // Celle vuote / solo spazi → null (non escludere la riga se altri campi mappati sono vuoti)
                const getVal = (field: string) => {
                    const col = mapping[field];
                    if (!col) return null;
                    const idx = rawHeaders.indexOf(col);
                    if (idx < 0) return null;
                    const val = row[idx];
                    if (val === undefined || val === null) return null;
                    const s = String(val).trim();
                    return s === "" ? null : s;
                };

                const base: any = {
                    sku: getVal("sku"),
                    ean: getVal("ean"),
                    parentSku: getVal("parentSku"),
                    title: getVal("title"),
                    description: getVal("description"),
                    shortDescription: getVal("shortDescription"),
                    price: getVal("price"),
                    brand: getVal("brand"),
                    category: getVal("category"),
                    bulletPoints: getVal("bulletPoints"),
                    dimensions: getVal("dimensions"),
                    weight: getVal("weight"),
                    material: getVal("material"),
                    seoText: getVal("seoText"),
                    stockLocal: getVal("stockLocal"),
                    stockSupplier: getVal("stockSupplier"),
                };

                // Costruisci oggetto con campi extra dinamici
                const extrasObj: Record<string, string> = {};
                extraFieldTemplates.forEach((tpl) => {
                    const col = extraFieldMapping[tpl.key];
                    if (!col) return;
                    const idx = rawHeaders.indexOf(col);
                    if (idx < 0) return;
                    const val = row[idx];
                    if (val === undefined || val === null) return;
                    const s = String(val).trim();
                    if (s !== "") extrasObj[tpl.key] = s;
                });
                if (Object.keys(extrasObj).length > 0) {
                    base.extraFields = extrasObj;
                }

                return base;
            }).filter((p) => {
                // Stessa logica del backend: solo SKU o EAN identificano la riga (titolo duplicato ignorato).
                return Boolean(p.sku || p.ean);
            });

            const totalDataRows = rawRows.length;
            const sentWithKey = productsToImport.length;
            const skippedNoKeyOnClient = totalDataRows - sentWithKey;

            const res = await axios.post("/api/repositories/" + catalogIdParam + "/staging", {
                products: productsToImport,
                lastListinoName: currentImportFile,
                overwrite: {
                    base: overwriteBaseInfo,
                    texts: overwriteTexts,
                    price: overwritePrice,
                    extras: overwriteExtras,
                }
            });

            const st = res.data?.stats;
            const dupBatch = res.data?.duplicatesInBatch as
                | { skuCounts: Record<string, number>; eanCounts: Record<string, number> }
                | undefined;
            const report: ImportLabReport = {
                at: new Date().toISOString(),
                fileName: currentImportFile || "listino",
                stats: st || {},
                duplicatesInBatch: {
                    skuCounts: dupBatch?.skuCounts || {},
                    eanCounts: dupBatch?.eanCounts || {},
                },
                clientRows: {
                    totalDataRows,
                    sentWithKey,
                    skippedNoKeyOnClient,
                },
            };
            setLastImportReport(report);
            try {
                sessionStorage.setItem("importLab_lastReport_" + catalogIdParam, JSON.stringify(report));
            } catch {
                /* ignore */
            }

            let detail =
                "Righe nel file: " +
                totalDataRows +
                ". Con SKU o EAN: " +
                sentWithKey +
                ".";
            if (skippedNoKeyOnClient > 0) {
                detail += " Saltate (senza SKU né EAN): " + skippedNoKeyOnClient + ".";
            }
            if (st) {
                if (st.skippedNoIdentifier > 0) {
                    detail += " Saltate lato server: " + st.skippedNoIdentifier + ".";
                }
                detail +=
                    " Nuovi prodotti in listino: " +
                    (st.stagingCreated ?? "?") +
                    ".";
                if ((st.stagingMergedOrUpdated ?? 0) > 0) {
                    detail +=
                        " Righe che aggiornano un prodotto già presente (stesso SKU o EAN nel file): " +
                        st.stagingMergedOrUpdated +
                        ".";
                }
                if ((st.rowErrors ?? 0) > 0) {
                    detail += " Errori su singole righe: " + st.rowErrors + ".";
                }
                const nSkuDup = Object.keys(report.duplicatesInBatch.skuCounts).length;
                const nEanDup = Object.keys(report.duplicatesInBatch.eanCounts).length;
                if (nSkuDup > 0 || nEanDup > 0) {
                    detail +=
                        " ⚠️ Duplicati nello stesso file: " +
                        (nSkuDup > 0 ? "SKU " + nSkuDup + " chiavi" : "") +
                        (nSkuDup > 0 && nEanDup > 0 ? ", " : "") +
                        (nEanDup > 0 ? "EAN " + nEanDup + " chiavi" : "") +
                        ". Vedi report sotto.";
                }
            }
            detail +=
                " Nota: una riga = un prodotto se SKU o EAN sono univoci; titoli uguali non uniscono mai le righe.";

            toast.update(toastId, {
                render: detail,
                type: "success",
                isLoading: false,
                autoClose: 9000,
            });
            setIsImportModalOpen(false);
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err) {
            toast.update(toastId, { render: "Errore durante il salvataggio dei dati.", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsSavingStaging(false);
        }
    };

    // PDF Upload Handler (max 50 MB, validated on server)
    const MAX_PDF_UPLOAD_MB = 50;
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !catalogIdParam) return;

        const sizeMB = file.size / 1024 / 1024;
        if (sizeMB > MAX_PDF_UPLOAD_MB) {
            toast.error("File troppo grande (max " + MAX_PDF_UPLOAD_MB + " MB). Riduci il PDF o dividi in più file.");
            return;
        }

        setIsUploadingPdf(true);
        const toastId = toast.loading("Caricamento PDF: " + file.name + "...");

        try {
            const blob = new Blob([file], { type: "application/pdf" });

            const res = await axios.post("/api/repositories/" + catalogIdParam + "/pdfs", blob, {
                headers: {
                    "Content-Type": "application/pdf",
                    "X-File-Name": encodeURIComponent(file.name)
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            let sizeMsg = res.data?.sizeMB != null ? " " + res.data.sizeMB + " MB" : "";
            if (res.data?.normalized) sizeMsg = sizeMsg ? sizeMsg + ", normalizzato" : " normalizzato";
            toast.update(toastId, { render: "PDF caricato con successo!" + (sizeMsg ? " (" + sizeMsg.trim() + ")" : ""), type: "success", isLoading: false, autoClose: 3000 });
            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            const status = err?.response?.status;
            const msg = err?.response?.data?.error;
            if (status === 413) {
                toast.update(toastId, { render: msg || "File troppo grande (max 50 MB).", type: "error", isLoading: false, autoClose: 5000 });
            } else if (status === 400 && msg) {
                toast.update(toastId, { render: msg, type: "error", isLoading: false, autoClose: 5000 });
            } else {
                toast.update(toastId, { render: "Errore durante il caricamento del PDF.", type: "error", isLoading: false, autoClose: 3000 });
            }
        } finally {
            setIsUploadingPdf(false);
        }
    };

    // Global PDF Search
    const handlePdfSearch = async () => {
        if (!repository?.pdfs?.length || products.length === 0 || !catalogIdParam) {
            toast.warning("Carica almeno un PDF e un listino per iniziare la ricerca.");
            return;
        }

        setIsSearchingPdf(true);
        const toastId = toast.loading("Scansione PDF in corso (Testi)...");
        let matchesCount = 0;

        try {
            const updatedProducts = [...products];

            for (const pdf of repository.pdfs) {
                const res = await fetch("/api/repositories/" + catalogIdParam + "/pdfs/" + pdf.id + "/file", { credentials: "include" });
                if (!res.ok) continue;
                const arrayBuffer = await res.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdfDoc = await loadingTask.promise;

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map((item: any) => item.str).join(" ").toLowerCase();

                    for (const product of updatedProducts) {
                        if (!product.sku) continue;
                        const sku = product.sku.toLowerCase();

                        if (pageText.includes(sku)) {
                            if (!product.foundInPdf) product.foundInPdf = [];
                            if (!product.foundInPdf.find(f => f.pdfId === pdf.id && f.pageNumber === i)) {
                                product.foundInPdf.push({ pageNumber: i, pdfId: pdf.id });
                                matchesCount++;
                            }
                        }
                    }
                }
            }

            setProducts(updatedProducts);
            toast.update(toastId, {
                render: "Ricerca completata: " + matchesCount + " riferimenti trovati nei PDF.",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
        } catch (err: any) {
            console.error("PDF Search error:", err);
            toast.update(toastId, { render: "Errore durante la scansione del PDF.", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsSearchingPdf(false);
        }
    };

    // V4 DISMANTLER AI EXTRACTION
    const handlePdfAiExtract = async () => {
        if (!repository?.pdfs?.length || !catalogIdParam) {
            toast.warning("Carica un PDF prima di lanciare l'IA.");
            return;
        }

        const currentPdfId = repository.pdfs[currentPdfIdx].id;
        setIsExtractingAi(true);
        const toastId = toast.loading("Gemini sta analizzando il PDF (stile NotebookLM)... Attendere.");

        try {
            const res = await axios.post("/api/repositories/" + catalogIdParam + "/pdfs/" + currentPdfId + "/extract");
            toast.update(toastId, {
                render: "Estrazione completata con Gemini: " + res.data.count + " prodotti identificati e mappati.",
                type: "success",
                isLoading: false,
                autoClose: 5000
            });
            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            console.error("Dismantler error:", err);
            const apiError = err?.response?.data?.error || err?.message || "Errore sconosciuto";
            const hint = err?.response?.data?.hint;
            const message = hint ? (apiError + ". " + hint) : apiError;
            toast.update(toastId, { render: message, type: "error", isLoading: false, autoClose: 6000 });
        } finally {
            setIsExtractingAi(false);
        }
    };

    const handlePdfSummarize = async () => {
        if (!repository?.pdfs?.length || !catalogIdParam) return;
        const currentPdfId = repository.pdfs[currentPdfIdx].id;
        setPdfSummaryLoading(true);
        setPdfSummary(null);
        try {
            const res = await axios.get("/api/repositories/" + catalogIdParam + "/pdfs/" + currentPdfId + "/summarize");
            setPdfSummary(res.data);
            toast.success("Riassunto generato.");
        } catch (err: any) {
            const data = err?.response?.data;
            const msg = data?.error || "Errore riassunto.";
            const hint = data?.hint;
            toast.error(hint ? msg + " " + hint : msg);
        } finally {
            setPdfSummaryLoading(false);
        }
    };

    const handlePdfAsk = async () => {
        const q = askQuestion.trim();
        if (!q || !repository?.pdfs?.length || !catalogIdParam) {
            toast.warning("Scrivi una domanda sul contenuto del PDF.");
            return;
        }
        const currentPdfId = repository.pdfs[currentPdfIdx].id;
        setAskLoading(true);
        setAskAnswer(null);
        try {
            const res = await axios.post("/api/repositories/" + catalogIdParam + "/pdfs/" + currentPdfId + "/ask", { question: q });
            setAskAnswer(res.data.answer || "");
        } catch (err: any) {
            toast.error(err?.response?.data?.error || "Errore risposta.");
        } finally {
            setAskLoading(false);
        }
    };

    // V4 MANUAL CROP SAVE
    const handleCropSave = async (page: number, bbox: any, dataUrl: string) => {
        if (!selectedProduct || !catalogIdParam) {
            toast.error("Associa questo ritaglio a un prodotto selezionandolo prima dalla tabella.");
            return;
        }

        const toastId = toast.loading("Salvataggio ritaglio immagine...");
        try {
            await axios.post("/api/repositories/" + catalogIdParam + "/staging/" + selectedProduct.id + "/image-crop", {
                dataUrl,
                page,
                bbox,
                sku: selectedProduct.sku
            });
            toast.update(toastId, { render: "Immagine associata con successo!", type: "success", isLoading: false, autoClose: 2000 });
            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            console.error("Crop save error:", err);
            toast.update(toastId, { render: "Errore nel salvataggio del ritaglio.", type: "error", isLoading: false, autoClose: 3000 });
        }
    };

    const handleProductSelectForVisualMapping = (p: StagingProduct) => {
        setSelectedProduct(p);
        const aiMapping = p.extraFields?.find((ef: any) => ef.key === "_ai_visual_mapping");
        if (aiMapping) {
            try {
                const mappingData = JSON.parse(aiMapping.value);
                setSelectedMapping(mappingData);
                setIsVisualMode(true);
            } catch (e) {
                console.error("Mapping parse error:", e);
                setSelectedMapping(null);
            }
        } else {
            setSelectedMapping(null);
        }
    };
    if (loading && !allRepositories.length) return <div className="p-12 text-center font-black text-slate-400 animate-pulse tracking-widest text-xs uppercase">Inizializzazione Import Lab V3.1...</div>;


    if (!repository) return (
        <div className="flex-1 bg-slate-50/50 p-12 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center gap-4 mb-12">
                    <div className="p-4 bg-slate-900 rounded-[2rem] shadow-xl">
                        <Cpu className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Import Lab</h1>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Seleziona un progetto sorgente per iniziare</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {allRepositories.map((repo) => (
                        <motion.div
                            key={repo.id}
                            whileHover={{ y: -5 }}
                            onClick={() => window.location.href = "/import?id=" + repo.id}
                            className="main-card p-8 cursor-pointer group hover:border-orange-200 transition-all border-2 border-transparent"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-orange-50 transition-colors">
                                    <Box className="w-6 h-6 text-slate-400 group-hover:text-orange-500" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h3 className="text-lg font-black text-slate-900 truncate group-hover:text-orange-600 transition-colors">{repo.name}</h3>
                                    <div className="flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(repo.createdAt).toLocaleDateString()}</p>
                                            {repo.lastListinoName && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleClearStagingForRepo(repo.id); }}
                                                    className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        {repo.lastListinoName && (
                                            <p className="text-[9px] font-black text-orange-500 uppercase tracking-tighter truncate max-w-[150px]">
                                                {repo.lastListinoName}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 rounded-xl p-3 flex flex-col items-center">
                                    <span className="text-sm font-black text-slate-900">{repo.pdfs?.length || 0}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PDF Files</span>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 flex flex-col items-center">
                                    <span className="text-sm font-black text-slate-900">{repo._count?.stagingProducts || 0}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Staging Prod.</span>
                                </div>
                            </div>

                            <button className="w-full mt-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2">
                                Apri Lab <ExternalLink className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}

                    {allRepositories.length === 0 && (
                        <div className="col-span-3 py-24 flex flex-col items-center justify-center text-slate-300">
                            <Box className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-black text-xs uppercase tracking-widest mb-6">Nessun progetto trovato</p>
                            <button onClick={() => window.location.href = '/catalogues'} className="px-8 py-3 bg-slate-100 text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                                Vai a Gestione Repository
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-slate-50/20">
            {/* Control Bar: Professional Multi-line layout */}
            <div className="bg-white border-b border-slate-100 flex flex-col p-4 sm:px-8 sm:py-6 gap-6 shrink-0 shadow-sm z-10 w-full">
                {/* First Row: Logo/Title & Primary Global Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5 min-w-0">
                        <div className="p-4 bg-slate-900 rounded-[1.5rem] shadow-xl shadow-slate-200/50 shrink-0">
                            <Cpu className="w-6 h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight truncate">{repository.name}</h2>
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-slate-200/50">
                                    Lab V4.0
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                                <HardDrive className="w-3 h-3 shrink-0" />
                                <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[300px]">{repository.imageFolderPath || "No Image Folder Configured"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePushToMasterErp}
                            className="flex-1 sm:flex-none px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-slate-300 flex items-center justify-center gap-3 group"
                        >
                            <Sparkles className="w-4 h-4 text-orange-400 group-hover:scale-125 transition-transform" />
                            <span className="whitespace-nowrap">Push to Master ERP</span>
                        </button>
                        <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <select
                                value={bulkField}
                                onChange={(e) => setBulkField(e.target.value as "brand" | "category" | "stockLocal" | "stockSupplier")}
                                className="px-2 py-1 rounded-lg border border-slate-200 bg-white font-black uppercase tracking-widest text-slate-500"
                            >
                                <option value="brand">Brand</option>
                                <option value="category">Categoria</option>
                                <option value="stockLocal">Magazzino interno</option>
                                <option value="stockSupplier">Magazzino fornitore</option>
                            </select>
                            <input
                                type="text"
                                placeholder={
                                    "Valore " +
                                    (bulkField === "brand"
                                        ? "Brand"
                                        : bulkField === "category"
                                        ? "Categoria"
                                        : bulkField === "stockLocal"
                                        ? "Magazzino interno"
                                        : "Magazzino fornitore")
                                }
                                value={bulkValue}
                                onChange={(e) => setBulkValue(e.target.value)}
                                className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white min-w-[140px]"
                            />
                            <label className="inline-flex items-center gap-1 text-slate-500">
                                <input
                                    type="checkbox"
                                    checked={bulkOnlyEmpty}
                                    onChange={(e) => setBulkOnlyEmpty(e.target.checked)}
                                    className="w-3 h-3 rounded border-slate-300 text-slate-900"
                                />
                                <span>Solo se vuoto</span>
                            </label>
                            <button
                                onClick={handleBulkStagingUpdate}
                                disabled={isBulkUpdating}
                                className="px-3 py-1.5 bg-slate-100 text-slate-900 rounded-xl font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-200 disabled:opacity-50"
                            >
                                {isBulkUpdating ? "In corso..." : "Applica a tutti"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row: bulk title edit (sostituisci/aggiungi) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>Modifica massiva titolo prodotto</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <input
                            type="text"
                            placeholder='Parte da sostituire (es. "IPLEX Design") - opzionale'
                            value={bulkTitleSearch}
                            onChange={(e) => setBulkTitleSearch(e.target.value)}
                            className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white min-w-[200px]"
                        />
                        <input
                            type="text"
                            placeholder='Nuovo testo da usare / aggiungere nel titolo'
                            value={bulkTitleReplace}
                            onChange={(e) => setBulkTitleReplace(e.target.value)}
                            className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 bg-white min-w-[220px]"
                        />
                        <button
                            onClick={handleBulkTitleUpdate}
                            disabled={isBulkTitleUpdating}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest border border-slate-900 hover:bg-black disabled:opacity-50"
                        >
                            {isBulkTitleUpdating ? "Titoli in corso..." : "Applica su tutti i titoli"}
                        </button>
                    </div>
                </div>

                {/* Second Row: Detailed Metadata & Action Buttons */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pt-6 border-t border-slate-50">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* PDF Count Indicator */}
                        <div className="inline-flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {repository.pdfs?.length || 0} PDF Sorgente
                            </span>
                        </div>

                        {/* Listini caricati: mostra tutti i file (listinoFiles), non solo l'ultimo */}
                        {(repository.listinoFiles?.length > 0 || repository.lastListinoName) && (
                            <div className="inline-flex flex-wrap items-center gap-2">
                                {(repository.listinoFiles?.length > 0
                                    ? repository.listinoFiles
                                    : [{ fileName: repository.lastListinoName, uploadedAt: null }]
                                ).map((lf: { id?: number; fileName: string; uploadedAt?: string | null }) => (
                                    <div
                                        key={lf.id ?? lf.fileName}
                                        className="inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-3.5 py-2 rounded-xl border border-orange-100/50"
                                    >
                                        <div className="p-1 bg-orange-500 rounded-md shrink-0">
                                            <FileSpreadsheet className="w-3 h-3 text-white" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[200px]" title={lf.fileName}>
                                            {lf.fileName}
                                        </span>
                                        {lf.uploadedAt && (
                                            <span className="text-[9px] text-orange-400 font-bold shrink-0">
                                                {new Date(lf.uploadedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={handleClearStaging}
                                    className="p-2 hover:bg-orange-200 text-orange-400 hover:text-orange-700 rounded-xl transition-all"
                                    title="Svuota Staging Lab (rimuove tutti i listini)"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Action Tools Grid */}
                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-5 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2.5"
                        >
                            <FileSpreadsheet className="w-4 h-4 text-green-600" />
                            Carica Listino
                        </button>

                        <input type="file" ref={pdfInputRef} className="hidden" accept=".pdf" onChange={handlePdfUpload} />
                        <button
                            onClick={() => pdfInputRef.current?.click()}
                            disabled={isUploadingPdf}
                            className="px-5 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2.5 disabled:opacity-50"
                        >
                            {isUploadingPdf ? <RefreshCw className="w-4 h-4 animate-spin text-orange-500" /> : <FileText className="w-4 h-4 text-orange-600" />}
                            Carica PDF
                        </button>

                        <button
                            onClick={handleFolderImageAssociation}
                            className="px-5 py-3 bg-white border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2.5"
                        >
                            <HardDrive className="w-4 h-4 text-blue-500" />
                            Associa Cartella
                        </button>

                        <div className="w-px h-8 bg-slate-100 mx-2 hidden md:block"></div>

                        <button
                            onClick={handlePdfSearch}
                            className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-200 rounded-2xl transition-all shadow-sm group"
                            title="Ricerca Avanzata nei PDF"
                        >
                            <ScanSearch className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>




            <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
                {/* Main Action Area: Table or Visual Dismantler */}
                <div className="flex-1 overflow-hidden bg-slate-50/30 flex flex-col">
                    {/* View Switcher Tabs */}
                    <div className="flex items-center gap-4 p-4 border-b border-white shrink-0">
                        <button
                            onClick={() => setIsVisualMode(false)}
                            className={"px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 " + (!isVisualMode ? "bg-slate-900 text-white shadow-xl" : "bg-white text-slate-400 hover:text-slate-900 border border-slate-100")}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Elenco Prodotti
                        </button>
                        <button
                            onClick={() => setIsVisualMode(true)}
                            className={"px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 " + (isVisualMode ? "bg-slate-900 text-white shadow-xl" : "bg-white text-slate-400 hover:text-slate-900 border border-slate-100")}
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                            Precision Dismantler
                        </button>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        <AnimatePresence mode="wait">
                            {!isVisualMode ? (
                                <motion.div
                                    key="table"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="h-full overflow-y-auto custom-scrollbar p-8"
                                >
                                    <div className="max-w-7xl mx-auto space-y-6">
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                                                Contenuto Repository ({tableProducts.length}
                                                {showOnlyDuplicates ? " visibili" : ""}/{products.length})
                                            </h3>
                                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowOnlyDuplicates((v) => !v)}
                                                    className={
                                                        "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shrink-0 " +
                                                        (showOnlyDuplicates
                                                            ? "bg-amber-100 border-amber-300 text-amber-900"
                                                            : "bg-white border-slate-200 text-slate-600 hover:border-amber-200")
                                                    }
                                                >
                                                    {showOnlyDuplicates ? "Mostra tutti" : "Solo duplicati SKU/EAN"}
                                                </button>
                                                <div className="relative group w-full sm:w-80">
                                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        placeholder="Filtra per SKU, EAN, Nome, Brand..."
                                                        className="w-full bg-white border border-slate-100 rounded-xl pl-12 pr-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {lastImportReport && (
                                            <div
                                                className={
                                                    "rounded-2xl border p-5 space-y-3 " +
                                                    (Object.keys(lastImportReport.duplicatesInBatch.skuCounts).length > 0 ||
                                                    Object.keys(lastImportReport.duplicatesInBatch.eanCounts).length > 0
                                                        ? "border-amber-300 bg-amber-50/90"
                                                        : "border-slate-200 bg-white")
                                                }
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <FileSpreadsheet className="w-5 h-5 text-slate-700 shrink-0" />
                                                        <div>
                                                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-800">
                                                                Report ultima importazione
                                                            </p>
                                                            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                                                {lastImportReport.fileName} ·{" "}
                                                                {new Date(lastImportReport.at).toLocaleString("it-IT")}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowImportReportPanel((v) => !v)}
                                                        className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-800"
                                                    >
                                                        {showImportReportPanel ? "Comprimi" : "Espandi"}
                                                    </button>
                                                </div>
                                                {showImportReportPanel && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                                                        <div className="space-y-1.5 rounded-xl bg-white/80 border border-slate-100 p-3">
                                                            <p className="font-black uppercase text-slate-400 text-[10px]">File → invio</p>
                                                            <ul className="font-bold text-slate-700 space-y-0.5 list-disc list-inside">
                                                                <li>Righe nel file: {lastImportReport.clientRows.totalDataRows}</li>
                                                                <li>Inviate (SKU o EAN): {lastImportReport.clientRows.sentWithKey}</li>
                                                                <li>
                                                                    Saltate in scheda (senza SKU né EAN):{" "}
                                                                    {lastImportReport.clientRows.skippedNoKeyOnClient}
                                                                </li>
                                                            </ul>
                                                        </div>
                                                        <div className="space-y-1.5 rounded-xl bg-white/80 border border-slate-100 p-3">
                                                            <p className="font-black uppercase text-slate-400 text-[10px]">Server staging</p>
                                                            <ul className="font-bold text-slate-700 space-y-0.5 list-disc list-inside">
                                                                <li>Nuovi in listino: {String(lastImportReport.stats.stagingCreated ?? "—")}</li>
                                                                <li>
                                                                    Aggiornati / merge:{" "}
                                                                    {String(lastImportReport.stats.stagingMergedOrUpdated ?? "—")}
                                                                </li>
                                                                <li>Saltate (no id): {String(lastImportReport.stats.skippedNoIdentifier ?? "—")}</li>
                                                                <li>Errori riga: {String(lastImportReport.stats.rowErrors ?? "—")}</li>
                                                            </ul>
                                                        </div>
                                                        <div className="md:col-span-2 space-y-2">
                                                            <p className="font-black uppercase text-amber-800 text-[10px] flex items-center gap-2">
                                                                <AlertCircle className="w-4 h-4" />
                                                                Duplicati nello stesso file (più righe con stesso SKU o stesso EAN)
                                                            </p>
                                                            {Object.keys(lastImportReport.duplicatesInBatch.skuCounts).length === 0 &&
                                                            Object.keys(lastImportReport.duplicatesInBatch.eanCounts).length === 0 ? (
                                                                <p className="text-slate-600 font-bold">Nessun duplicato rilevato nel file.</p>
                                                            ) : (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <div className="rounded-xl border border-amber-200 bg-white p-3 max-h-40 overflow-y-auto">
                                                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-2">SKU</p>
                                                                        <ul className="space-y-1 font-mono text-[11px] text-slate-800">
                                                                            {Object.entries(lastImportReport.duplicatesInBatch.skuCounts).map(
                                                                                ([k, c]) => (
                                                                                    <li key={"sdup-" + k}>
                                                                                        <span className="font-black">{k}</span>{" "}
                                                                                        <span className="text-amber-700">×{c}</span>
                                                                                    </li>
                                                                                )
                                                                            )}
                                                                        </ul>
                                                                    </div>
                                                                    <div className="rounded-xl border border-amber-200 bg-white p-3 max-h-40 overflow-y-auto">
                                                                        <p className="text-[10px] font-black text-slate-500 uppercase mb-2">EAN</p>
                                                                        <ul className="space-y-1 font-mono text-[11px] text-slate-800">
                                                                            {Object.entries(lastImportReport.duplicatesInBatch.eanCounts).map(
                                                                                ([k, c]) => (
                                                                                    <li key={"edup-" + k}>
                                                                                        <span className="font-black">{k}</span>{" "}
                                                                                        <span className="text-amber-700">×{c}</span>
                                                                                    </li>
                                                                                )
                                                                            )}
                                                                        </ul>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Table Content... */}

                                        <div className="main-card overflow-x-auto">
                                            <table className="w-full text-left border-collapse min-w-[800px]">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-100">
                                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">SKU / EAN</th>
                                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nome Prodotto</th>
                                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Prezzo</th>
                                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Immagini</th>
                                                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">PDF Ref</th>
                                                        <th className="px-6 py-4"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {tableProducts.map((p) => {
                                                        const { skuDup, eanDup } = stagingRowDuplicateFlags(p);
                                                        const dupClass =
                                                            skuDup || eanDup
                                                                ? " bg-amber-50/90 border-l-4 border-amber-400"
                                                                : "";
                                                        return (
                                                        <tr key={p.id} className={"hover:bg-slate-50/50 transition-colors group" + dupClass}>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="text-sm font-black text-slate-900">{p.sku}</span>
                                                                        {skuDup && (
                                                                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-950">
                                                                                SKU dup
                                                                            </span>
                                                                        )}
                                                                        {eanDup && (
                                                                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-orange-200 text-orange-950">
                                                                                EAN dup
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-slate-400">{p.ean || "NS-EAN"}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-sm font-bold text-slate-600 truncate max-w-[200px] block">
                                                                    {p.texts[0]?.title || "Nessun titolo"}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="text-sm font-black text-slate-900">
                                                                    {p.prices[0]?.price ? (p.prices[0].price + " €") : "--"}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {p.images.slice(0, 3).map((img, i) => (
                                                                        <div key={i} className="w-8 h-8 rounded-lg border border-slate-100 overflow-hidden bg-white shadow-sm shrink-0">
                                                                            <img src={img.imageUrl} className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ))}
                                                                    {p.images.length > 3 && (
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-400">
                                                                            +{p.images.length - 3}
                                                                        </div>
                                                                    )}
                                                                    {p.images.length === 0 && (
                                                                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                                                                            <ImageIconLucide className="w-4 h-4 text-slate-200" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                {p.foundInPdf ? (
                                                                    <div className="inline-flex items-center gap-2 px-2 py-1 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-orange-100">
                                                                        <FileText className="w-3 h-3" />
                                                                        Pag. {p.foundInPdf[0].pageNumber}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-slate-300">No Ref</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    onClick={() => handleProductSelectForVisualMapping(p)}
                                                                    className={"p-2 rounded-xl transition-all " + (selectedProduct?.id === p.id ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-lg opacity-0 group-hover:opacity-100")}
                                                                >
                                                                    <ScanSearch className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedProduct(p);
                                                                        setIsProductModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-lg rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                                >
                                                                    <ExternalLink className="w-5 h-5" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="visual"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.05 }}
                                    className="h-full"
                                >
                                    <PdfVisualWorkspace
                                        pdfInstance={pdfInstance}
                                        selectedProductMapping={selectedMapping}
                                        onCropSave={handleCropSave}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* PDF Quick Pane (if repo has pdfs) */}
                {repository.pdfs?.length > 0 && (
                    <div className="w-full lg:w-[400px] xl:w-[450px] border-t lg:border-t-0 lg:border-l border-slate-100 bg-white flex flex-col shrink-0">
                        <div className="p-5 sm:p-6 border-b border-slate-50 flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-orange-500" />
                                    PDF Explorer
                                </h4>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={handlePdfSummarize}
                                        disabled={pdfSummaryLoading}
                                        className="px-3 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {pdfSummaryLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                        Riassumi
                                    </button>
                                    <button
                                        onClick={handlePdfAiExtract}
                                        disabled={isExtractingAi}
                                        className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isExtractingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                        Estrai prodotti
                                    </button>
                                    <button
                                        onClick={() => handleDeletePdf(repository.pdfs[currentPdfIdx].id)}
                                        className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition-colors border border-transparent hover:border-red-100"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">File Selezionato:</span>
                                <select
                                    className="w-full text-[11px] font-black uppercase tracking-widest bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-4 focus:ring-orange-50 transition-all truncate"
                                    value={currentPdfIdx}
                                    onChange={(e) => setCurrentPdfIdx(Number(e.target.value))}
                                >
                                    {repository.pdfs.map((pdf: any, i: number) => (
                                        <option key={i} value={i}>{pdf.fileName}</option>
                                    ))}
                                </select>
                            </div>

                            {pdfSummary && (
                                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Riassunto (Gemini)</span>
                                    <p className="text-xs text-slate-700 mt-1.5">{pdfSummary.summary}</p>
                                    {pdfSummary.pageCount != null && <p className="text-[10px] text-slate-500 mt-1">Pagine: {pdfSummary.pageCount}</p>}
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chiedi al catalogo (NotebookLM)</span>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={askQuestion}
                                        onChange={(e) => setAskQuestion(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handlePdfAsk()}
                                        placeholder="Es: Quali prodotti costano più di 100€?"
                                        className="flex-1 text-[11px] bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <button
                                        onClick={handlePdfAsk}
                                        disabled={askLoading}
                                        className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-bold disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {askLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        Chiedi
                                    </button>
                                </div>
                                {askAnswer != null && askAnswer !== "" && (
                                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700">{askAnswer}</div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-50 overflow-y-auto p-4 custom-scrollbar">
                            {/* Placeholder for PDF Thumbnails */}
                            <div className="grid grid-cols-2 gap-4">
                                {pdfPages.map((page, i) => (
                                    <div key={i} className="aspect-[1/1.4] bg-white border border-slate-200 rounded-xl shadow-sm hover:border-orange-200 transition-all cursor-pointer flex flex-col p-2 group">
                                        <div className="flex-1 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-300 group-hover:text-orange-300 overflow-hidden relative">
                                            {pdfInstance ? (
                                                <PdfPageThumbnail pageNumber={page.pageNumber} pdfDoc={pdfInstance} />
                                            ) : (
                                                <span>Pag. {page.pageNumber}</span>
                                            )}
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/5 transition-colors">
                                                <span className="opacity-0 group-hover:opacity-100 bg-white/90 px-2 py-1 rounded text-[8px] font-black text-slate-900 border border-slate-200 shadow-sm">
                                                    Pag. {page.pageNumber}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal placeholder (Phase 3) */}
            <AnimatePresence>
                {isProductModalOpen && selectedProduct && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        {/* Modal Content - will implement in detail in next step */}
                        <div className="w-full h-full max-w-7xl bg-white rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-orange-600 rounded-2xl">
                                        <Package className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedProduct.sku}</h2>
                                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Editor Scheda Import</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handleSaveProductChange}
                                        className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" /> Salva Modifiche
                                    </button>
                                    <button onClick={() => setIsProductModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                                        <X className="w-8 h-8 text-slate-300" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 flex overflow-hidden">
                                {/* LEFT: Data Form */}
                                <div className="w-1/2 p-10 overflow-y-auto custom-scrollbar border-r border-slate-50">
                                    <div className="space-y-8">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Titolo Prodotto</label>
                                                <input
                                                    value={selectedProduct.texts[0]?.title || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => {
                                                        const p = { ...selectedProduct };
                                                        if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                        p.texts[0].title = e.target.value;
                                                        setSelectedProduct(p);
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Prezzo (€)</label>
                                                <input
                                                    value={selectedProduct.prices[0]?.price || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => {
                                                        const p = { ...selectedProduct };
                                                        if (!p.prices[0]) p.prices[0] = { listName: 'default' };
                                                        p.prices[0].price = e.target.value;
                                                        setSelectedProduct(p);
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">EAN</label>
                                                <input
                                                    value={selectedProduct.ean || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, ean: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Brand</label>
                                                <input
                                                    value={selectedProduct.brand || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, brand: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Categoria</label>
                                                <input
                                                    value={selectedProduct.category || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, category: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Parent SKU</label>
                                                <input
                                                    value={selectedProduct.parentSku || ""}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setSelectedProduct({ ...selectedProduct, parentSku: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Dimensioni</label>
                                                <input
                                                    value={getExtra(selectedProduct, "dimensions")}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setExtra(selectedProduct, "dimensions", e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Peso</label>
                                                <input
                                                    value={getExtra(selectedProduct, "weight")}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setExtra(selectedProduct, "weight", e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Materiale</label>
                                            <input
                                                value={getExtra(selectedProduct, "material")}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                onChange={e => setExtra(selectedProduct, "material", e.target.value)}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Magazzino locale</label>
                                                <input
                                                    value={getExtra(selectedProduct, "stockLocal")}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setExtra(selectedProduct, "stockLocal", e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Magazzino fornitore</label>
                                                <input
                                                    value={getExtra(selectedProduct, "stockSupplier")}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                    onChange={e => setExtra(selectedProduct, "stockSupplier", e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Campi extra (come in mappatura import + COLORE) */}
                                        {(() => {
                                            const importExtraReserved = new Set([
                                                "dimensions",
                                                "weight",
                                                "material",
                                                "stocklocal",
                                                "stocksupplier",
                                                "colore",
                                                "_ai_visual_mapping",
                                            ]);
                                            const tplKeys = new Set(
                                                extraFieldTemplates.map((t) => String(t.key || "").toLowerCase())
                                            );
                                            const orphanExtras = (selectedProduct.extraFields || []).filter((e: any) => {
                                                const k = String(e.key || "").toLowerCase();
                                                if (!k || importExtraReserved.has(k)) return false;
                                                if (tplKeys.has(k)) return false;
                                                return true;
                                            });
                                            return (
                                                <div className="pt-6 border-t border-slate-100 space-y-6">
                                                    <div className="flex items-center gap-2">
                                                        <Sparkles className="w-4 h-4 text-orange-500" />
                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                                            Campi extra personalizzati
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-6">
                                                        <div className="space-y-2 col-span-2 sm:col-span-1">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                                COLORE
                                                            </label>
                                                            <input
                                                                value={getExtra(selectedProduct, "colore")}
                                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                                placeholder="Es. Rosso, Nero…"
                                                                onChange={(e) => setExtra(selectedProduct, "colore", e.target.value)}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-6">
                                                        {extraFieldTemplates
                                                            .filter((tpl) => String(tpl.key || "").toLowerCase() !== "colore")
                                                            .map((tpl) => (
                                                                <div key={tpl.id + "-" + tpl.key} className="space-y-2">
                                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                                        {tpl.label}
                                                                    </label>
                                                                    <input
                                                                        value={getExtra(selectedProduct, tpl.key)}
                                                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                                        onChange={(e) =>
                                                                            setExtra(selectedProduct, tpl.key, e.target.value)
                                                                        }
                                                                    />
                                                                </div>
                                                            ))}
                                                    </div>
                                                    {orphanExtras.length > 0 && (
                                                        <div className="grid grid-cols-2 gap-6">
                                                            {orphanExtras.map((e: any) => (
                                                                <div key={e.key} className="space-y-2">
                                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                                        {e.key}
                                                                    </label>
                                                                    <input
                                                                        value={String(e.value ?? "")}
                                                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold"
                                                                        onChange={(ev) =>
                                                                            setExtra(selectedProduct, e.key, ev.target.value)
                                                                        }
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col sm:flex-row gap-3">
                                                        <input
                                                            value={importSheetNewExtraKey}
                                                            onChange={(e) => setImportSheetNewExtraKey(e.target.value)}
                                                            placeholder="Nome campo extra (es. STAGIONE)"
                                                            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700"
                                                        />
                                                        <input
                                                            value={importSheetNewExtraValue}
                                                            onChange={(e) => setImportSheetNewExtraValue(e.target.value)}
                                                            placeholder="Valore"
                                                            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const k = importSheetNewExtraKey.trim();
                                                                if (!k) return;
                                                                setExtra(selectedProduct, k, importSheetNewExtraValue);
                                                                setImportSheetNewExtraKey("");
                                                                setImportSheetNewExtraValue("");
                                                            }}
                                                            className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black whitespace-nowrap"
                                                        >
                                                            Aggiungi
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrizione (lunga)</label>
                                            <textarea
                                                value={selectedProduct.texts[0]?.description || ""}
                                                rows={4}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold resize-none"
                                                onChange={e => {
                                                    const p = { ...selectedProduct };
                                                    if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                    p.texts[0].description = e.target.value;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Caratteristiche (Bullet Points)</label>
                                            <textarea
                                                value={selectedProduct.texts[0]?.bulletPoints || ""}
                                                rows={4}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold resize-none"
                                                onChange={e => {
                                                    const p = { ...selectedProduct };
                                                    if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                    p.texts[0].bulletPoints = e.target.value;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrizione breve / Documentale</label>
                                            <textarea
                                                value={selectedProduct.texts[0]?.docDescription || ""}
                                                rows={2}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold resize-none"
                                                onChange={e => {
                                                    const p = { ...selectedProduct };
                                                    if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                    p.texts[0].docDescription = e.target.value;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Testo SEO / Copywriting breve</label>
                                            <textarea
                                                value={selectedProduct.texts[0]?.seoAiText || ""}
                                                rows={2}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold resize-none"
                                                onChange={e => {
                                                    const p = { ...selectedProduct };
                                                    if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                    p.texts[0].seoAiText = e.target.value;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 block">Galleria Immagini ({selectedProduct.images.length})</label>
                                            <div className="grid grid-cols-4 gap-4">
                                                {selectedProduct.images.map((img, i) => (
                                                    <div key={i} className="aspect-square rounded-2xl border border-slate-100 overflow-hidden relative group bg-slate-50">
                                                        <img src={img.imageUrl} className="w-full h-full object-cover" />
                                                        <button
                                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                const imgUrl = img.imageUrl;
                                                                if (catalogIdParam && selectedProduct.id && imgUrl) {
                                                                    axios.delete("/api/repositories/" + catalogIdParam + "/staging/" + selectedProduct.id + "/images", {
                                                                        data: { imageUrl: imgUrl }
                                                                    }).catch(e => console.error("Image detach error:", e));
                                                                }
                                                                const p = { ...selectedProduct };
                                                                p.images = p.images.filter((_: any, idx: number) => idx !== i);
                                                                setSelectedProduct(p);
                                                            }}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={openImagePicker}
                                                    className="aspect-square rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-300 hover:border-orange-200 hover:text-orange-400 transition-all"
                                                >
                                                    <Plus className="w-5 h-5" />
                                                    <span className="text-[8px] font-black uppercase">Aggiungi</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* RIGHT: PDF Content & Area Selector */}
                                <div className="flex-1 bg-slate-100 flex flex-col items-center justify-center relative">
                                    {selectedProduct.foundInPdf ? (
                                        <div className="w-full h-full flex flex-col">
                                            {/* We will eventually render a PDF viewer here */}
                                            <div className="flex-1 flex items-center justify-center bg-slate-200">
                                                <div className="text-center space-y-4">
                                                    <FileText className="w-16 h-16 text-slate-400 mx-auto" />
                                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Anteprima PDF Pagina {selectedProduct.foundInPdf[0].pageNumber}</p>
                                                    <button className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Apri Visualizzatore</button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px] flex flex-col items-center gap-4">
                                            <Scissors className="w-12 h-12 opacity-20" />
                                            PDF Area Selector Tool
                                            <span className="text-slate-300 text-center px-20 font-bold normal-case tracking-normal">In questa sezione verrà visualizzato il PDF con la possibilità di ritaglio immagini e selezione testo.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* Import Mapping Modal */}
            <AnimatePresence>
                {isImportModalOpen && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                        >
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-green-600 rounded-2xl">
                                        <FileSpreadsheet className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mappatura Campi Listino</h2>
                                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Collega le colonne del tuo file ai campi del sistema</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                                    <X className="w-8 h-8 text-slate-300" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                                    {Object.keys(mapping).map((field) => {
                                        let label = field.charAt(0).toUpperCase() + field.slice(1);
                                        if (field === 'sku') label = 'SKU (chiave preferita)';
                                        if (field === 'ean') label = 'EAN / Codice a barre';
                                        if (field === 'parentSku') label = 'SKU di Base (Varianti)';
                                        if (field === 'price') label = 'Prezzo di Listino';
                                        if (field === 'title') label = 'Titolo Prodotto';
                                        if (field === 'bulletPoints') label = 'Caratteristiche (Bullet)';
                                        if (field === 'description') label = 'Descrizione Lunga';
                                        if (field === 'shortDescription') label = 'Descrizione Breve / SEO';
                                        if (field === 'dimensions') label = 'Dimensioni';
                                        if (field === 'weight') label = 'Peso';
                                        if (field === 'material') label = 'Materiale';
                                        if (field === 'seoText') label = 'Testo SEO AI / Extra';
                                        if (field === 'stockLocal') label = 'Magazzino locale (Q.tà)';
                                        if (field === 'stockSupplier') label = 'Magazzino fornitore (Q.tà)';

                                        return (
                                            <div key={field} className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                        {label}
                                                    </label>
                                                    {mapping[field] && (
                                                        <span className="text-[9px] font-bold text-green-500 flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> Collegato
                                                        </span>
                                                    )}
                                                </div>
                                                <select
                                                    value={mapping[field]}
                                                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all appearance-none cursor-pointer"
                                                >
                                                    <option value="">-- Seleziona Colonna --</option>
                                                    {rawHeaders.map((h, i) => (
                                                        <option key={i} value={h}>{h}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Sezione campi extra dinamici */}
                                <div className="mt-10 border-t border-slate-100 pt-8">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                            Campi Extra Personalizzati
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                                        {extraFieldTemplates.map((tpl) => (
                                            <div key={tpl.id} className="space-y-3">
                                                <div className="flex items-center justify-between px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                        {tpl.label}
                                                    </label>
                                                    {extraFieldMapping[tpl.key] && (
                                                        <span className="text-[9px] font-bold text-green-500 flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> Collegato
                                                        </span>
                                                    )}
                                                </div>
                                                <select
                                                    value={extraFieldMapping[tpl.key] || ""}
                                                    onChange={(e) =>
                                                        setExtraFieldMapping({
                                                            ...extraFieldMapping,
                                                            [tpl.key]: e.target.value,
                                                        })
                                                    }
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all appearance-none cursor-pointer"
                                                >
                                                    <option value="">-- Seleziona Colonna --</option>
                                                    {rawHeaders.map((h, i) => (
                                                        <option key={i} value={h}>
                                                            {h}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Aggiunta nuovo campo extra */}
                                    <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 px-1">
                                        <input
                                            type="text"
                                            value={newExtraLabel}
                                            onChange={(e) => setNewExtraLabel(e.target.value)}
                                            placeholder="Nome nuovo campo extra (es. Colore interno)"
                                            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 bg-slate-50"
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const label = newExtraLabel.trim();
                                                if (!label || !catalogIdParam) return;
                                                try {
                                                    const res = await axios.post(
                                                        "/api/catalogues/" + catalogIdParam + "/extra-fields",
                                                        { label }
                                                    );
                                                    const created = res.data;
                                                    setExtraFieldTemplates((prev) => [...prev, created]);
                                                    setNewExtraLabel("");
                                                } catch (err) {
                                                    console.error("Create extra field template error:", err);
                                                    toast.error("Errore nella creazione del campo extra.");
                                                }
                                            }}
                                            className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-colors"
                                        >
                                            Aggiungi Campo Extra
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-12">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 px-1">Anteprima Dati (prime 3 righe)</h4>
                                    <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-slate-50/50">
                                        <table className="w-full text-left text-xs">
                                            {/* Mostra le colonne effettivamente mappate (cosi capisci perché un campo non arriva in scheda). */}
                                            {(() => {
                                                const previewFieldOrder = [
                                                    "sku",
                                                    "ean",
                                                    "parentSku",
                                                    "category",
                                                    "brand",
                                                    "title",
                                                    "price",
                                                ] as const;

                                                const fieldLabelMap: Record<string, string> = {
                                                    sku: "SKU",
                                                    ean: "EAN",
                                                    parentSku: "SKU Padre",
                                                    category: "Categoria",
                                                    brand: "Brand",
                                                    title: "Titolo",
                                                    price: "Prezzo",
                                                };

                                                const mappedFields = previewFieldOrder.filter((f) => !!mapping[f]);

                                                const columns = (mappedFields.length > 0
                                                    ? mappedFields.map((field) => ({
                                                        field,
                                                        header: mapping[field]!,
                                                        label: fieldLabelMap[field] || field,
                                                    }))
                                                    : rawHeaders.slice(0, 5).map((h) => ({
                                                        field: h,
                                                        header: h,
                                                        label: h,
                                                    }))) as Array<{ field: string; header: string; label: string }>;

                                                return (
                                                    <>
                                                        <thead>
                                                            <tr className="bg-slate-100">
                                                                {columns.map((c, i) => (
                                                                    <th
                                                                        key={`${c.field}-${i}`}
                                                                        className="px-5 py-3 font-black text-slate-500 uppercase tracking-widest text-[9px]"
                                                                    >
                                                                        {c.label}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {rawRows.slice(0, 3).map((row, i) => (
                                                                <tr key={i}>
                                                                    {columns.map((c, j) => {
                                                                        const idx = rawHeaders.indexOf(c.header);
                                                                        const value = idx > -1 ? row[idx] : undefined;
                                                                        return (
                                                                            <td
                                                                                key={j}
                                                                                className="px-5 py-3 font-bold text-slate-600 truncate max-w-[150px]"
                                                                            >
                                                                                {value}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </>
                                                );
                                            })()}
                                        </table>
                                    </div>
                                </div>

                                {(repository.listinoFiles?.length || repository.lastListinoName) && (
                                    <div className="mt-10 space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
                                            Come gestire i prodotti già presenti nel Lab
                                        </h4>
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <label className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:border-slate-200 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={overwriteBaseInfo}
                                                    onChange={e => setOverwriteBaseInfo(e.target.checked)}
                                                    className="mt-1 accent-slate-900"
                                                />
                                                <div className="space-y-0.5">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                                                        Aggiorna dati base (brand, categoria)
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 font-medium">
                                                        Se attivo, il secondo file può aggiornare brand, categoria e SKU/EAN normalizzati.
                                                    </div>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:border-slate-200 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={overwriteTexts}
                                                    onChange={e => setOverwriteTexts(e.target.checked)}
                                                    className="mt-1 accent-slate-900"
                                                />
                                                <div className="space-y-0.5">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                                                        Aggiorna testi scheda
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 font-medium">
                                                        Titolo, descrizioni, bullet e testo SEO vengono sovrascritti solo se nel nuovo file sono valorizzati.
                                                    </div>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:border-slate-200 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={overwritePrice}
                                                    onChange={e => setOverwritePrice(e.target.checked)}
                                                    className="mt-1 accent-slate-900"
                                                />
                                                <div className="space-y-0.5">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                                                        Aggiorna prezzo di questo listino
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 font-medium">
                                                        Se disattivo, il prezzo esistente per questo listino rimane invariato.
                                                    </div>
                                                </div>
                                            </label>
                                            <label className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:border-slate-200 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={overwriteExtras}
                                                    onChange={e => setOverwriteExtras(e.target.checked)}
                                                    className="mt-1 accent-slate-900"
                                                />
                                                <div className="space-y-0.5">
                                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                                                        Aggiorna campi extra
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 font-medium">
                                                        Dimensioni, peso, materiale, magazzino locale/fornitore.
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 border-t border-slate-50 bg-slate-50/30 flex gap-4">
                                <button
                                    onClick={() => setIsImportModalOpen(false)}
                                    className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={isSavingStaging || !(mapping.sku || mapping.ean)}
                                    className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isSavingStaging ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Database className="w-4 h-4" />
                                    )}
                                    Conferma Importazione nel Lab
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Push to Master ERP Confirmation Modal */}
            <AnimatePresence>
                {isPushConfirmOpen && (
                    <div className="fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-3xl bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden"
                        >
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-slate-900 rounded-2xl">
                                        <Sparkles className="w-6 h-6 text-orange-300" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Conferma Push verso Master ERP</h2>
                                        <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">
                                            {products.length} prodotti verranno inviati dal Import Lab al Master ERP
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setIsPushConfirmOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors">
                                    <X className="w-8 h-8 text-slate-300" />
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
                                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                                        Regole di sovrascrittura
                                    </p>
                                    <p className="text-sm text-slate-500 mb-4">
                                        Per i prodotti che esistono già nel Master ERP, seleziona in modo esplicito quali dati possono essere
                                        <span className="font-bold"> sovrascritti</span>. Lo <span className="font-bold">SKU</span> non viene mai modificato
                                        ed è sempre usato insieme all&apos;EAN come chiave di identificazione del prodotto.
                                        Se non selezioni nulla, i prodotti esistenti verranno lasciati intatti (verranno creati solo i nuovi prodotti e i collegamenti al catalogo).
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Identità e classificazione</p>
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteBrand}
                                                    onChange={(e) => setPushOverwriteBrand(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Brand</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi brand e collegamento alla tabella marchi.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteCategory}
                                                    onChange={(e) => setPushOverwriteCategory(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Categoria</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi categoria e gerarchia (livello 1-2-3).
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteEan}
                                                    onChange={(e) => setPushOverwriteEan(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">EAN / Barcode</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi il codice a barre associato allo SKU.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteParentSku}
                                                    onChange={(e) => setPushOverwriteParentSku(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">SKU di base (parent)</div>
                                                    <div className="text-xs text-slate-500">
                                                        Collega/scollega lo SKU a una variante padre.
                                                    </div>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contenuti e pricing</p>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteTitle}
                                                    onChange={(e) => setPushOverwriteTitle(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Titolo</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi il titolo principale del prodotto.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteLongDesc}
                                                    onChange={(e) => setPushOverwriteLongDesc(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Descrizione lunga</div>
                                                    <div className="text-xs text-slate-500">
                                                        Testo descrittivo esteso (scheda prodotto).
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteBullets}
                                                    onChange={(e) => setPushOverwriteBullets(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Bullet / Caratteristiche</div>
                                                    <div className="text-xs text-slate-500">
                                                        Elenco puntato delle caratteristiche principali.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteSeo}
                                                    onChange={(e) => setPushOverwriteSeo(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Descrizione breve / SEO</div>
                                                    <div className="text-xs text-slate-500">
                                                        Campo di sintesi usato per SEO, listing, ecc.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwritePrice}
                                                    onChange={(e) => setPushOverwritePrice(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Prezzo di listino</div>
                                                    <div className="text-xs text-slate-500">
                                                        Aggiorna il prezzo del listino &quot;default&quot;.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteExtras}
                                                    onChange={(e) => setPushOverwriteExtras(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Campi extra</div>
                                                    <div className="text-xs text-slate-500">
                                                        Dimensioni, peso, materiale e tutti gli altri campi extra (escluso stock).
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteStockLocal}
                                                    onChange={(e) => setPushOverwriteStockLocal(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Stock locale</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi solo `stockLocal`.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteStockSupplier}
                                                    onChange={(e) => setPushOverwriteStockSupplier(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Stock fornitore</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi solo `stockSupplier`.
                                                    </div>
                                                </div>
                                            </label>

                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={pushOverwriteImages}
                                                    onChange={(e) => setPushOverwriteImages(e.target.checked)}
                                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900"
                                                />
                                                <div>
                                                    <div className="font-bold text-slate-800">Immagini</div>
                                                    <div className="text-xs text-slate-500">
                                                        Sovrascrivi completamente le immagini del prodotto con quelle presenti nell&apos;Import Lab.
                                                    </div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-xs text-slate-500">
                                    Puoi annullare questa operazione chiudendo il pannello o premendo &quot;Annulla&quot;:
                                    nessun dato verrà scritto nel Master ERP finché non confermi esplicitamente.
                                </div>
                            </div>

                            <div className="sticky bottom-0 p-4 sm:p-6 border-t border-slate-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 flex gap-3 sm:gap-4">
                                <button
                                    onClick={() => setIsPushConfirmOpen(false)}
                                    className="flex-1 py-3 sm:py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    Annulla (torna al Lab)
                                </button>
                                <button
                                    onClick={executePushToMasterErp}
                                    className="flex-[2] py-3 sm:py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl flex items-center justify-center gap-3"
                                >
                                    <Sparkles className="w-4 h-4 text-orange-300" />
                                    Conferma Push verso Master ERP
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Image Picker Modal */}
            <AnimatePresence>
                {isImagePickerOpen && (
                    <div className="fixed inset-0 z-[180] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-slate-900">
                                        <ImageIconLucide className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 tracking-tight">
                                            Associa immagini da cartella
                                        </h2>
                                        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">
                                            SKU {selectedProduct?.sku} – anteprima immagini trovate nella cartella repository
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsImagePickerOpen(false)}
                                    className="p-2 rounded-full hover:bg-slate-50 transition-colors"
                                >
                                    <X className="w-6 h-6 text-slate-300" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                {imagePickerLoading ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                                        <RefreshCw className="w-6 h-6 animate-spin" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                            Scansione cartella immagini...
                                        </span>
                                    </div>
                                ) : imagePickerItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
                                        <ImageIconLucide className="w-10 h-10" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center">
                                            Nessuna immagine trovata per questa SKU.
                                        </span>
                                        <span className="text-[10px] font-medium text-slate-400 text-center max-w-md">
                                            Verifica che i file immagine nella cartella contengano lo SKU nel nome
                                            (es. <code className="font-mono">SKU123.jpg</code> oppure <code className="font-mono">SKU123_front.png</code>).
                                        </span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                        {imagePickerItems.map((img) => {
                                            const checked = imagePickerSelection.includes(img.relativePath);
                                            return (
                                                <button
                                                    key={img.relativePath}
                                                    type="button"
                                                    onClick={() => {
                                                        setImagePickerSelection(prev =>
                                                            checked
                                                                ? prev.filter(p => p !== img.relativePath)
                                                                : [...prev, img.relativePath]
                                                        );
                                                    }}
                                                    className={"relative aspect-square rounded-2xl border overflow-hidden group " + (checked ? "border-orange-500 ring-2 ring-orange-500/40" : "border-slate-100 hover:border-orange-200")}
                                                >
                                                    <img
                                                        src={img.url}
                                                        alt={img.fileName}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors" />
                                                    <div className="absolute bottom-1 left-1 right-1 text-[9px] font-bold text-white bg-slate-900/60 rounded-lg px-1 py-0.5 line-clamp-1">
                                                        {img.fileName}
                                                    </div>
                                                    {checked && (
                                                        <div className="absolute top-1 right-1 bg-orange-500 text-white rounded-full p-1">
                                                            <Check className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button
                                    onClick={() => setIsImagePickerOpen(false)}
                                    className="flex-1 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-100 transition-colors"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={handleConfirmImagePicker}
                                    disabled={imagePickerSelection.length === 0}
                                    className="flex-[2] py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    <ImageIconLucide className="w-4 h-4" />
                                    Associa {imagePickerSelection.length || ""} immagine
                                    {imagePickerSelection.length === 1 ? "" : "e"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
}

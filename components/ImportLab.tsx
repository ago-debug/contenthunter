"use client";

import React, { useState, useEffect, useRef } from "react";
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
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import { useCatalog } from "./CatalogContext";
import PdfVisualWorkspace from "./PdfVisualWorkspace";

if (typeof window !== "undefined") {
    // Legacy build is robust across dev/prod environments
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
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

// Helper component to render a single PDF page thumbnail
const PdfPageThumbnail = ({ pageNumber, pdfDoc }: { pageNumber: number, pdfDoc: any }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const renderPage = async () => {
            if (!canvasRef.current || !pdfDoc) return;
            try {
                const page = await pdfDoc.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 0.4 });
                const canvas = canvasRef.current;
                const context = canvas.getContext("2d");

                if (context) {
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport }).promise;
                }
            } catch (err) {
                console.error("Error rendering thumbnail:", err);
            }
        };
        renderPage();
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
        sku: "", ean: "", parentSku: "", title: "", price: "", brand: "", category: "", description: "", bulletPoints: ""
    });
    const [currentImportFile, setCurrentImportFile] = useState<string>("");
    const [isSavingStaging, setIsSavingStaging] = useState(false);
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);
    const [isExtractingAi, setIsExtractingAi] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    // V4 DISMANTLER STATES
    const [isVisualMode, setIsVisualMode] = useState(false);
    const [selectedMapping, setSelectedMapping] = useState<any | null>(null);

    useEffect(() => {
        if (catalogIdParam) {
            fetchRepository(parseInt(catalogIdParam));
        } else {
            fetchAllRepositories();
        }
    }, [catalogIdParam]);

    // Handle PDF switching
    useEffect(() => {
        if (repository?.pdfs?.length > 0 && repository.pdfs[currentPdfIdx]) {
            console.log(`[PDF-SWITCH] Loading PDF index ${currentPdfIdx}: ${repository.pdfs[currentPdfIdx].fileName}`);
            loadPdfPages(repository.pdfs[currentPdfIdx].filePath);
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
        setLoading(true);
        try {
            const [repoRes, productsRes] = await Promise.all([
                axios.get(`/api/catalogues/${id}`),
                axios.get(`/api/repositories/${id}/staging`)
            ]);
            setRepository(repoRes.data);
            setProducts(productsRes.data);

            // If there are PDFs, load the first one's pages if needed
            if (repoRes.data.pdfs?.length > 0) {
                loadPdfPages(repoRes.data.pdfs[0].filePath);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            toast.error("Errore nel caricamento del repository");
        } finally {
            setLoading(false);
        }
    };

    const loadPdfPages = async (url: string) => {
        if (!url) return;

        // Clean the URL to ensure it doesn't have leading/trailing issues
        const cleanPath = url.startsWith('/') ? url : `/${url}`;
        const finalUrl = `/api/storage?path=${encodeURIComponent(cleanPath)}`;

        try {
            console.log(`[PDF-LOAD] Attempting to load from: ${finalUrl}`);
            const loadingTask = pdfjsLib.getDocument({
                url: finalUrl,
                withCredentials: true,
                // Disable range requests to force full file download (safer for unstable servers)
                disableRange: true,
                disableAutoFetch: false
            });
            const pdf = await loadingTask.promise;
            setPdfInstance(pdf);
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pages.push({ pageNumber: i });
            }
            setPdfPages(pages);
        } catch (err) {
            console.error("PDF Load Error:", err);
            toast.error("Impossibile caricare l'anteprima PDF (Struttura non valida o sessione scaduta).");
        }
    };

    const handleSaveProductChange = async () => {
        if (!selectedProduct || !catalogIdParam) return;

        const toastId = toast.loading("Salvataggio modifiche...");
        try {
            await axios.put(`/api/repositories/${catalogIdParam}/staging/${selectedProduct.id}`, selectedProduct);
            toast.update(toastId, { render: "Prodotto aggiornato!", type: "success", isLoading: false, autoClose: 2000 });
            fetchRepository(parseInt(catalogIdParam));
            setIsProductModalOpen(false);
        } catch (err: any) {
            toast.update(toastId, { render: "Errore nel salvataggio", type: "error", isLoading: false, autoClose: 3000 });
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
            const res = await axios.post(`/api/repositories/${catalogIdParam}/associate-images`);

            if (res.data.success) {
                toast.update(toastId, {
                    render: `Associazione completata: ${res.data.count} immagini associate con successo dalla cartella.`,
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
                const cleanPath = pdf.filePath.startsWith('/') ? pdf.filePath : `/${pdf.filePath}`;
                const finalUrl = `/api/storage?path=${encodeURIComponent(cleanPath)}`;

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
                                await axios.post(`/api/repositories/${catalogIdParam}/staging-image`, {
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
                render: `Associazione PDF completata: ${associationsCount} immagini associate.`,
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
            await axios.delete(`/api/repositories/${catalogIdParam}/pdfs/${pdfId}`);
            toast.success("PDF eliminato con successo");
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err: any) {
            toast.error("Errore durante l'eliminazione del PDF");
        }
    };
    const handleClearStaging = async () => {
        if (!window.confirm("Sei sicuro di voler svuotare il listino? Tutti i dati non salvati andranno persi.")) return;

        try {
            await axios.delete(`/api/repositories/${catalogIdParam}/staging`);
            toast.success("Listino rimosso con successo");
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err: any) {
            toast.error("Errore durante la rimozione del listino");
        }
    };

    const handleClearStagingForRepo = async (repoId: number) => {
        if (!window.confirm("Sei sicuro di voler svuotare il listino di questo repository?")) return;
        try {
            await axios.delete(`/api/repositories/${repoId}/staging`);
            toast.success("Listino rimosso");
            fetchAllRepositories();
        } catch (err) {
            toast.error("Errore");
        }
    };

    const handleConfirmImport = async () => {
        if (!mapping.sku) {
            toast.warning("Devi mappare almeno il campo SKU!");
            return;
        }

        setIsSavingStaging(true);
        const toastId = toast.loading("Salvataggio dati in corso...");

        try {
            const productsToImport = rawRows.map(row => {
                const getVal = (field: string) => {
                    const idx = rawHeaders.indexOf(mapping[field]);
                    const val = idx > -1 ? row[idx] : null;
                    return val !== undefined && val !== null ? String(val) : null;
                };

                return {
                    sku: getVal("sku"),
                    ean: getVal("ean"),
                    parentSku: getVal("parentSku"),
                    title: getVal("title"),
                    price: getVal("price"),
                    brand: getVal("brand"),
                    category: getVal("category"),
                    description: getVal("description"),
                    bulletPoints: getVal("bulletPoints")
                };
            }).filter(p => p.sku);

            await axios.post(`/api/repositories/${catalogIdParam}/staging`, {
                products: productsToImport,
                lastListinoName: currentImportFile
            });

            toast.update(toastId, { render: "Importazione completata con successo!", type: "success", isLoading: false, autoClose: 3000 });
            setIsImportModalOpen(false);
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err) {
            toast.update(toastId, { render: "Errore durante il salvataggio dei dati.", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsSavingStaging(false);
        }
    };

    // PDF Upload Handler
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !catalogIdParam) return;

        setIsUploadingPdf(true);
        const toastId = toast.loading(`Caricamento PDF: ${file.name}...`);

        try {
            // Using a Blob wrapper to ensure browser treats it as atomic binary content
            const blob = new Blob([file], { type: 'application/pdf' });

            await axios.post(`/api/repositories/${catalogIdParam}/pdfs`, blob, {
                headers: {
                    "Content-Type": "application/pdf",
                    "X-File-Name": encodeURIComponent(file.name)
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            toast.update(toastId, { render: "PDF caricato con successo!", type: "success", isLoading: false, autoClose: 3000 });
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err: any) {
            console.error("PDF upload error:", err);
            toast.update(toastId, { render: "Errore durante il caricamento del PDF.", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsUploadingPdf(false);
        }
    };

    // Global PDF Search
    const handlePdfSearch = async () => {
        if (!repository?.pdfs?.length || products.length === 0) {
            toast.warning("Carica almeno un PDF e un listino per iniziare la ricerca.");
            return;
        }

        setIsSearchingPdf(true);
        const toastId = toast.loading("Scansione PDF in corso (Testi)...");
        let matchesCount = 0;

        try {
            const updatedProducts = [...products];

            for (const pdf of repository.pdfs) {
                const safePdfPath = (pdf.filePath.startsWith('/') ? pdf.filePath.substring(1) : pdf.filePath).split('/').map((s: string) => encodeURIComponent(s)).join('/');
                const loadingTask = pdfjsLib.getDocument(`/${safePdfPath}`);
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
                render: `Ricerca completata: ${matchesCount} riferimenti trovati nei PDF.`,
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
        const toastId = toast.loading("ContentHunter AI sta analizzando il layout del PDF... Attendere.");

        try {
            const res = await axios.post(`/api/repositories/${catalogIdParam}/pdfs/${currentPdfId}/extract`);
            toast.update(toastId, {
                render: `Dismantling completato! ✨ ${res.data.count} prodotti identificati e mappati.`,
                type: "success",
                isLoading: false,
                autoClose: 5000
            });
            fetchRepository(parseInt(catalogIdParam));
        } catch (err: any) {
            console.error("Dismantler error:", err);
            toast.update(toastId, { render: "Errore durante lo smontaggio AI.", type: "error", isLoading: false, autoClose: 5000 });
        } finally {
            setIsExtractingAi(false);
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
            await axios.post(`/api/repositories/${catalogIdParam}/staging/${selectedProduct.id}/image-crop`, {
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
                            onClick={() => window.location.href = `/import?id=${repo.id}`}
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
                        <button className="flex-1 sm:flex-none px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-slate-300 flex items-center justify-center gap-3 group">
                            <Sparkles className="w-4 h-4 text-orange-400 group-hover:scale-125 transition-transform" />
                            <span className="whitespace-nowrap">Push to Master ERP</span>
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

                        {/* Current Listino Indicator - Highlighted if present */}
                        {repository.lastListinoName && (
                            <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-3.5 py-2 rounded-xl border border-orange-100/50">
                                <div className="p-1 bg-orange-500 rounded-md">
                                    <FileSpreadsheet className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[200px]">{repository.lastListinoName}</span>
                                <button
                                    onClick={handleClearStaging}
                                    className="ml-2 p-1 hover:bg-orange-200 text-orange-400 hover:text-orange-700 rounded-lg transition-all"
                                    title="Svuota Staging Lab"
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
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${!isVisualMode ? 'bg-slate-900 text-white shadow-xl' : 'bg-white text-slate-400 hover:text-slate-900 border border-slate-100'}`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Elenco Prodotti
                        </button>
                        <button
                            onClick={() => setIsVisualMode(true)}
                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${isVisualMode ? 'bg-slate-900 text-white shadow-xl' : 'bg-white text-slate-400 hover:text-slate-900 border border-slate-100'}`}
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
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Contenuto Repository ({products.length})</h3>
                                            <div className="relative group w-full sm:w-80">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    placeholder="Filtra per SKU, Nome..."
                                                    className="w-full bg-white border border-slate-100 rounded-xl pl-12 pr-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                                                    value={searchTerm}
                                                    onChange={e => setSearchTerm(e.target.value)}
                                                />
                                            </div>
                                        </div>
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
                                                    {products.filter(p => p.sku.toLowerCase().includes(searchTerm.toLowerCase())).map((p) => (
                                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-black text-slate-900">{p.sku}</span>
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
                                                                    {p.prices[0]?.price ? `${p.prices[0].price} €` : "--"}
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
                                                                    className={`p-2 rounded-xl transition-all ${selectedProduct?.id === p.id ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-900 hover:bg-white hover:shadow-lg opacity-0 group-hover:opacity-100'}`}
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
                                                    ))}
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
                                        onClick={handlePdfAiExtract}
                                        disabled={isExtractingAi}
                                        className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isExtractingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                        Smonta PDF
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

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrizione</label>
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

                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 block">Galleria Immagini ({selectedProduct.images.length})</label>
                                            <div className="grid grid-cols-4 gap-4">
                                                {selectedProduct.images.map((img, i) => (
                                                    <div key={i} className="aspect-square rounded-2xl border border-slate-100 overflow-hidden relative group bg-slate-50">
                                                        <img src={img.imageUrl} className="w-full h-full object-cover" />
                                                        <button
                                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                const p = { ...selectedProduct };
                                                                p.images.splice(i, 1);
                                                                setSelectedProduct(p);
                                                            }}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button className="aspect-square rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-300 hover:border-orange-200 hover:text-orange-400 transition-all">
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
                                        if (field === 'sku') label = 'SKU (Obbligatorio)';
                                        if (field === 'ean') label = 'EAN / Codice a barre';
                                        if (field === 'parentSku') label = 'SKU di Base (Varianti)';
                                        if (field === 'price') label = 'Prezzo di Listino';
                                        if (field === 'title') label = 'Titolo Prodotto';
                                        if (field === 'bulletPoints') label = 'Caratteristiche (Bullet)';

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

                                <div className="mt-12">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 px-1">Anteprima Dati (prime 3 righe)</h4>
                                    <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-slate-50/50">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="bg-slate-100">
                                                    {rawHeaders.slice(0, 5).map((h, i) => (
                                                        <th key={i} className="px-5 py-3 font-black text-slate-500 uppercase tracking-widest text-[9px]">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {rawRows.slice(0, 3).map((row, i) => (
                                                    <tr key={i}>
                                                        {rawHeaders.slice(0, 5).map((h, j) => (
                                                            <td key={j} className="px-5 py-3 font-bold text-slate-600 truncate max-w-[150px]">{row[rawHeaders.indexOf(h)]}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
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
                                    disabled={isSavingStaging || !mapping.sku}
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

        </div>
    );
}

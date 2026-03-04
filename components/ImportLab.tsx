"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
    Package, FileText, Search, Plus, Trash2, ImageIcon,
    CheckCircle2, ChevronRight, ChevronLeft, LayoutGrid,
    List, Sparkles, Box, Database, HardDrive, Cpu,
    Layers, X, Maximize2, Globe, RefreshCw, AlertCircle,
    FileSpreadsheet, Image as ImageIconLucide, Scissors,
    Wand2, ScanSearch, ExternalLink, Check, Save, Settings
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { toast } from "react-toastify";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import PdfVisualWorkspace from "./PdfVisualWorkspace";

// PDF.js Worker initialization
if (typeof window !== "undefined") {
    // Standard robust CDN for workers matching installed version
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface StagingProduct {
    id: number;
    sku: string;
    ean?: string;
    parentSku?: string;
    title?: string;
    brand?: string;
    category?: string;
    description?: string;
    bulletPoints?: string;
    price?: string;
    aiMapping?: any;
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

    // Phase Management
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

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
            loadPdfPages(repository.pdfs[currentPdfIdx].filePath);
        }
    }, [currentPdfIdx, repository?.pdfs]);

    // Auto-advance step based on content
    useEffect(() => {
        if (activeStep === 1 && repository?.pdfs?.length > 0) {
            setActiveStep(2);
        }
        if (activeStep === 2 && products.length > 0) {
            setActiveStep(3);
        }
    }, [repository?.pdfs?.length, products.length]);

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

            // Flatten product data for easier UI access but keep structure for backend
            const flattenedProducts = productsRes.data.map((p: any) => ({
                ...p,
                title: p.texts[0]?.title || "",
                description: p.texts[0]?.description || "",
                bulletPoints: p.texts[0]?.bulletPoints || "",
                price: p.prices[0]?.price || "",
                aiMapping: p.extraFields?.find((f: any) => f.key === "_ai_visual_mapping")?.value
                    ? JSON.parse(p.extraFields.find((f: any) => f.key === "_ai_visual_mapping").value)
                    : null
            }));
            setProducts(flattenedProducts);

            if (repoRes.data.pdfs?.length > 0) {
                loadPdfPages(repoRes.data.pdfs[0].filePath);
            }
        } catch (err) {
            toast.error("Errore nel caricamento del repository");
        } finally {
            setLoading(false);
        }
    };

    const loadPdfPages = async (url: string) => {
        if (!url) return;
        const finalUrl = url.startsWith('/') ? url : `/${url}`;

        try {
            const loadingTask = pdfjsLib.getDocument({
                url: finalUrl,
                withCredentials: true,
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
            toast.error("Impossibile caricare l'anteprima PDF.");
        }
    };

    const handleSaveProductChange = async () => {
        if (!selectedProduct || !catalogIdParam) return;
        const toastId = toast.loading("Salvataggio...");
        try {
            await axios.put(`/api/repositories/${catalogIdParam}/staging/${selectedProduct.id}`, selectedProduct);
            toast.update(toastId, { render: "Aggiornato!", type: "success", isLoading: false, autoClose: 2000 });
            fetchRepository(parseInt(catalogIdParam));
            setIsProductModalOpen(false);
        } catch (err: any) {
            toast.update(toastId, { render: "Errore!", type: "error", isLoading: false, autoClose: 2000 });
        }
    };

    const normalizeText = (text: any) => {
        if (text === null || text === undefined) return null;
        let s = String(text);
        s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
        s = s.replace(/\s+/g, ' ').trim();
        return s;
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const buffer = evt.target?.result;
            if (!buffer) return;

            let wb;
            try {
                if (file.name.toLowerCase().endsWith('.csv')) {
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(new Uint8Array(buffer as ArrayBuffer));
                    wb = XLSX.read(text, { type: 'string' });
                } else {
                    wb = XLSX.read(buffer, { type: "array", codepage: 65001 });
                }
            } catch (err) {
                wb = XLSX.read(buffer, { type: "array" });
            }

            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
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

    const handleConfirmImport = async () => {
        if (!mapping.sku) {
            toast.warning("Mappa almeno lo SKU!");
            return;
        }

        setIsSavingStaging(true);
        const toastId = toast.loading("Importazione...");

        try {
            const productsToImport = rawRows.map(row => {
                const getVal = (field: string) => {
                    const idx = rawHeaders.indexOf(mapping[field]);
                    return idx > -1 ? String(row[idx]) : null;
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

            toast.update(toastId, { render: "Completato!", type: "success", isLoading: false, autoClose: 2000 });
            setIsImportModalOpen(false);
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err) {
            toast.update(toastId, { render: "Errore!", type: "error", isLoading: false, autoClose: 2000 });
        } finally {
            setIsSavingStaging(false);
        }
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !catalogIdParam) return;

        setIsUploadingPdf(true);
        const toastId = toast.loading(`Caricamento PDF...`);

        try {
            const blob = new Blob([file], { type: 'application/pdf' });
            await axios.post(`/api/repositories/${catalogIdParam}/pdfs`, blob, {
                headers: {
                    "Content-Type": "application/pdf",
                    "X-File-Name": encodeURIComponent(file.name)
                }
            });

            toast.update(toastId, { render: "PDF Caricato!", type: "success", isLoading: false, autoClose: 2000 });
            fetchRepository(parseInt(catalogIdParam!));
        } catch (err) {
            toast.update(toastId, { render: "Errore PDF!", type: "error", isLoading: false, autoClose: 2000 });
        } finally {
            setIsUploadingPdf(false);
        }
    };

    const handlePdfSearch = async () => {
        if (!repository?.pdfs?.length || products.length === 0) return;
        setIsSearchingPdf(true);
        const toastId = toast.loading("Scansione testi PDF...");
        try {
            const updatedProducts = [...products];
            for (const pdf of repository.pdfs) {
                const finalUrl = pdf.filePath.startsWith('/') ? pdf.filePath : `/${pdf.filePath}`;
                const loadingTask = pdfjsLib.getDocument(finalUrl);
                const pdfDoc = await loadingTask.promise;

                for (let i = 1; i <= pdfDoc.numPages; i++) {
                    const page = await pdfDoc.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map((item: any) => item.str).join(" ").toLowerCase();

                    for (const product of updatedProducts) {
                        if (product.sku && pageText.includes(product.sku.toLowerCase())) {
                            if (!product.foundInPdf) product.foundInPdf = [];
                            if (!product.foundInPdf.find(f => f.pdfId === pdf.id && f.pageNumber === i)) {
                                product.foundInPdf.push({ pageNumber: i, pdfId: pdf.id });
                            }
                        }
                    }
                }
            }
            setProducts(updatedProducts);
            toast.update(toastId, { render: "Scansione terminata!", type: "success", isLoading: false, autoClose: 2000 });
        } catch (err) {
            toast.update(toastId, { render: "Errore scansione!", type: "error", isLoading: false, autoClose: 2000 });
        } finally {
            setIsSearchingPdf(false);
        }
    };

    const handlePdfAiExtract = async () => {
        if (!repository?.pdfs?.length || !catalogIdParam) return;
        const currentPdfId = repository.pdfs[currentPdfIdx].id;
        setIsExtractingAi(true);
        const toastId = toast.loading("AI Engine: Analisi Layout in corso...");
        try {
            const res = await axios.post(`/api/repositories/${catalogIdParam}/pdfs/${currentPdfId}/extract`);
            toast.update(toastId, { render: `Smontaggio completato! ${res.data.count} prodotti.`, type: "success", isLoading: false, autoClose: 3000 });
            fetchRepository(parseInt(catalogIdParam));
        } catch (err) {
            toast.update(toastId, { render: "Errore IA!", type: "error", isLoading: false, autoClose: 3000 });
        } finally {
            setIsExtractingAi(false);
        }
    };

    const handleCropSave = async (page: number, bbox: any, dataUrl: string) => {
        if (!selectedProduct || !catalogIdParam) {
            toast.warning("Seleziona un prodotto prima di ritagliare.");
            return;
        }
        try {
            await axios.post(`/api/repositories/${catalogIdParam}/staging/${selectedProduct.id}/image-crop`, {
                dataUrl, page, bbox, sku: selectedProduct.sku
            });
            toast.success("Crop salvato!");
            fetchRepository(parseInt(catalogIdParam));
        } catch (err) {
            toast.error("Errore salvataggio crop.");
        }
    };

    if (loading && !allRepositories.length) return <div className="p-12 text-center font-black text-slate-400 animate-pulse text-xs uppercase">Caricamento Lab...</div>;

    if (!repository) return (
        <div className="flex-1 bg-slate-50/50 p-12 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center gap-4 mb-12">
                    <div className="p-4 bg-slate-900 rounded-[2rem] shadow-xl"><Cpu className="w-8 h-8 text-white" /></div>
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Import Lab</h1>
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Seleziona un progetto sorgente</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {allRepositories.map((repo) => (
                        <div key={repo.id} onClick={() => window.location.href = `/import?id=${repo.id}`} className="main-card p-8 cursor-pointer group hover:border-orange-200 transition-all border-2 border-transparent">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-orange-50 transition-colors"><Box className="w-6 h-6 text-slate-400" /></div>
                                <h3 className="text-lg font-black text-slate-900 truncate">{repo.name}</h3>
                            </div>
                            <button className="w-full mt-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2">
                                Apri Lab <ExternalLink className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-slate-50/20">
            {/* TOP BAR & STEPPER */}
            <div className="bg-white border-b border-slate-100 flex flex-col p-4 sm:px-8 sm:py-6 gap-6 shrink-0 shadow-sm z-10 w-full font-inter">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex items-center gap-5 min-w-0">
                        <div className="p-4 bg-slate-900 rounded-[1.5rem] shadow-xl shrink-0"><Cpu className="w-6 h-6 text-white" /></div>
                        <div className="min-w-0">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight truncate">{repository.name}</h2>
                        </div>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-8 px-8 py-3 bg-slate-50 border border-slate-100 rounded-3xl shadow-inner-sm">
                        <div className={`flex items-center gap-3 transition-all ${activeStep === 1 ? 'opacity-100 scale-105' : 'opacity-40 grayscale'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${activeStep === 1 ? 'bg-orange-500 text-white' : 'bg-slate-200'}`}>1</div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Caricamento</span>
                        </div>
                        <div className="w-12 h-px bg-slate-200"></div>
                        <div className={`flex items-center gap-3 transition-all ${activeStep === 2 ? 'opacity-100 scale-105' : 'opacity-40 grayscale'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${activeStep === 2 ? 'bg-orange-500 text-white' : 'bg-slate-200'}`}>2</div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Anteprima</span>
                        </div>
                        <div className="w-12 h-px bg-slate-200"></div>
                        <div className={`flex items-center gap-3 transition-all ${activeStep === 3 ? 'opacity-100 scale-105' : 'opacity-40 grayscale'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${activeStep === 3 ? 'bg-orange-500 text-white' : 'bg-slate-200'}`}>3</div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Smontaggio</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeStep < 3 && (
                            <button
                                onClick={() => setActiveStep((prev: any) => (prev + 1) as 1 | 2 | 3)}
                                className="px-8 py-4 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-md flex items-center gap-2 group"
                            >
                                Prossimo Step <ChevronRight className="w-4 h-4 group-hover:translate-x-1" />
                            </button>
                        )}
                        {activeStep === 3 && (
                            <button className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-3 group">
                                <Sparkles className="w-4 h-4 text-orange-400 group-hover:scale-125 transition-transform" />
                                <span className="whitespace-nowrap">Push to ERP</span>
                            </button>
                        )}
                        <button onClick={() => window.location.href = '/catalogues'} className="p-3 text-slate-400 hover:text-slate-900 bg-white border border-slate-100 rounded-2xl transition-all"><X className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex flex-col flex-1 overflow-hidden">
                {activeStep === 1 && (
                    <div className="flex-1 overflow-y-auto p-12 bg-slate-50/50">
                        <div className="max-w-4xl mx-auto space-y-12">
                            <div className="text-center">
                                <h1 className="text-4xl font-black text-slate-900 tracking-tight">Caricamento Sorgenti</h1>
                                <p className="text-lg font-bold text-slate-400 uppercase tracking-widest mt-4">Prepara il terreno per lo smontaggio AI</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div onClick={() => fileInputRef.current?.click()} className="main-card p-12 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/10 cursor-pointer transition-all flex flex-col items-center text-center space-y-6 group">
                                    <div className="p-6 bg-indigo-50 text-indigo-600 rounded-3xl group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-12 h-12" /></div>
                                    <h3 className="text-xl font-black text-slate-900">1. Listino Prodotti</h3>
                                    {repository.lastListinoName ? <div className="text-green-600 font-black text-xs uppercase">{repository.lastListinoName}</div> : <button className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase">Sfoglia</button>}
                                </div>
                                <div onClick={() => pdfInputRef.current?.click()} className="main-card p-12 border-2 border-dashed border-slate-200 hover:border-orange-400 hover:bg-orange-50/10 cursor-pointer transition-all flex flex-col items-center text-center space-y-6 group">
                                    <div className="p-6 bg-orange-50 text-orange-600 rounded-3xl group-hover:scale-110 transition-transform"><FileText className="w-12 h-12" /></div>
                                    <h3 className="text-xl font-black text-slate-900">2. Documenti PDF</h3>
                                    {repository.pdfs?.length > 0 ? <div className="text-orange-600 font-black text-xs uppercase">{repository.pdfs.length} PDF</div> : <button className="px-8 py-3 bg-orange-600 text-white rounded-xl font-black text-[10px] uppercase">Sfoglia</button>}
                                </div>
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                            <input type="file" ref={pdfInputRef} className="hidden" accept=".pdf" onChange={handlePdfUpload} />
                        </div>
                    </div>
                )}

                {activeStep === 2 && (
                    <div className="flex-1 flex overflow-hidden">
                        <div className="w-64 bg-white border-r border-slate-100 flex flex-col shrink-0">
                            <div className="p-4 border-b border-slate-50 font-black text-[10px] uppercase tracking-widest text-slate-400">Pagine Documento ({pdfPages.length})</div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                {pdfPages.map((p) => (
                                    <button key={p.pageNumber} className="w-full aspect-[3/4] bg-slate-50 rounded-xl border border-slate-100 hover:border-orange-200 transition-all overflow-hidden relative group">
                                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-white rounded font-black text-[8px] z-10">{p.pageNumber}</div>
                                        <PdfPageThumbnail pageNumber={p.pageNumber} pdfDoc={pdfInstance} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 bg-slate-100 relative">
                            <PdfVisualWorkspace
                                pdfInstance={pdfInstance}
                                onCropSave={handleCropSave}
                            />
                        </div>
                    </div>
                )}

                {activeStep === 3 && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-100">
                                <div className="p-6 bg-slate-50/50 flex items-center justify-between border-b border-slate-100">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Libreria Staging ({products.length})</h3>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold w-64" placeholder="Cerca SKU..." />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                    <table className="w-full text-left border-separate border-spacing-y-2">
                                        <thead>
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <th className="px-6 py-2">Asset</th>
                                                <th className="px-6 py-2">SKU</th>
                                                <th className="px-6 py-2">Prodotto</th>
                                                <th className="px-6 py-2 text-center">Reference</th>
                                                <th className="px-6 py-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {products.filter(p => p.sku?.toLowerCase().includes(searchTerm.toLowerCase())).map((p) => (
                                                <tr key={p.id} className="group hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-3 border-y first:border-l last:border-r border-slate-100 rounded-l-2xl">
                                                        <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden border border-slate-100">
                                                            {p.images?.[0] ? <img src={p.images[0].imageUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-slate-300 m-4" />}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 border-y border-slate-100 font-mono text-xs font-black">{p.sku}</td>
                                                    <td className="px-6 py-3 border-y border-slate-100">
                                                        <div className="text-sm font-bold text-slate-900 truncate max-w-xs">{p.title || "---"}</div>
                                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{p.brand || "NO BRAND"}</div>
                                                    </td>
                                                    <td className="px-6 py-3 border-y border-slate-100 text-center">
                                                        {p.foundInPdf?.length ? <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded text-[9px] font-black border border-orange-100">PAG {p.foundInPdf[0].pageNumber}</span> : <span className="text-[9px] font-black text-slate-300">MISSING</span>}
                                                    </td>
                                                    <td className="px-6 py-3 border-y border-slate-100 rounded-r-2xl text-right">
                                                        <button onClick={() => { setSelectedProduct(p); setIsProductModalOpen(true); }} className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all shadow-sm"><Maximize2 className="w-4 h-4" /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="w-96 bg-slate-50/50 p-8 flex flex-col space-y-8 border-l border-slate-100 overflow-y-auto">
                                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-500" /> Dismantling AI Suite</h4>
                                <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6">
                                    <p className="text-xs font-bold text-slate-500 leading-relaxed">Analizza l'intero catalogo per estrarre automaticamente dati e immagini.</p>
                                    <button onClick={handlePdfAiExtract} disabled={isExtractingAi} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                                        {isExtractingAi ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                                        Esegui Smontaggio
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MODALS */}
            <AnimatePresence>
                {isProductModalOpen && selectedProduct && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] overflow-hidden font-inter">
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-orange-600 rounded-2xl"><Package className="w-6 h-6 text-white" /></div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedProduct.sku}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={handleSaveProductChange} className="px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2"><Save className="w-4 h-4" /> Salva</button>
                                    <button onClick={() => setIsProductModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X className="w-8 h-8 text-slate-200" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-2 gap-12 custom-scrollbar">
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Titolo</label>
                                            <input
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold"
                                                value={selectedProduct.title || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const p = { ...selectedProduct, title: val };
                                                    if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                    p.texts[0].title = val;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prezzo</label>
                                            <input
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold"
                                                value={selectedProduct.price || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const p = { ...selectedProduct, price: val };
                                                    if (!p.prices[0]) p.prices[0] = { listName: 'default' };
                                                    p.prices[0].price = val;
                                                    setSelectedProduct(p);
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Brand</label>
                                            <input
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold"
                                                value={selectedProduct.brand || ""}
                                                onChange={e => setSelectedProduct({ ...selectedProduct, brand: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria</label>
                                            <input
                                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold"
                                                value={selectedProduct.category || ""}
                                                onChange={e => setSelectedProduct({ ...selectedProduct, category: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descrizione</label>
                                        <textarea
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold h-32 resize-none"
                                            value={selectedProduct.description || ""}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const p = { ...selectedProduct, description: val };
                                                if (!p.texts[0]) p.texts[0] = { language: 'it' };
                                                p.texts[0].description = val;
                                                setSelectedProduct(p);
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-6 pt-6 border-t border-slate-50">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Galleria Immagini ({selectedProduct.images.length})</label>
                                        <div className="grid grid-cols-4 gap-4">
                                            {selectedProduct.images.map((img, i) => (
                                                <div key={i} className="aspect-square rounded-2xl border border-slate-100 overflow-hidden relative group bg-slate-50">
                                                    <img src={img.imageUrl} className="w-full h-full object-cover" />
                                                    <button onClick={() => { const p = { ...selectedProduct }; p.images.splice(i, 1); setSelectedProduct(p); }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: PDF VIEW */}
                                <div className="h-full border-l border-slate-100 flex flex-col overflow-hidden rounded-3xl">
                                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ritaglio Immagine Prodotto</span>
                                        {selectedProduct.aiMapping && <span className="text-[8px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">AI Mapping detected</span>}
                                    </div>
                                    <div className="flex-1 bg-slate-900 overflow-hidden relative">
                                        <PdfVisualWorkspace
                                            pdfInstance={pdfInstance}
                                            onCropSave={handleCropSave}
                                            selectedProductMapping={selectedProduct.aiMapping}
                                        />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isImportModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden font-inter">
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mappatura Campi Listino</h2>
                                <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X className="w-8 h-8 text-slate-200" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                                <div className="grid grid-cols-2 gap-8">
                                    {Object.keys(mapping).map((field) => (
                                        <div key={field} className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{field}</label>
                                            <select value={mapping[field]} onChange={e => setMapping({ ...mapping, [field]: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold">
                                                <option value="">-- Seleziona --</option>
                                                {rawHeaders.map((h, i) => <option key={i} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-8 border-t border-slate-50 flex gap-4 shrink-0">
                                <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 rounded-xl font-black text-[10px] uppercase">Annulla</button>
                                <button onClick={handleConfirmImport} disabled={isSavingStaging || !mapping.sku} className="flex-[2] py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow-xl flex items-center justify-center gap-3 disabled:opacity-50">
                                    {isSavingStaging ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Conferma Importazione
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

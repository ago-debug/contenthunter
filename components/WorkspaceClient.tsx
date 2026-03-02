"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Upload, FileDown, Plus, Trash2, ImageIcon, FileText, CheckCircle2, ChevronRight, ChevronLeft, LayoutGrid, List, Sparkles, Box, Database, HardDrive, Cpu, Layers, Users, BookOpen, X, Search, Maximize2, Globe, Chrome, Package, History, Settings, BarChart3, Filter, FolderOpen, RefreshCw, Languages, AlertTriangle, AlertCircle, Info, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { toast } from "react-toastify";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import EdgeScroll from "./EdgeScroll";
import { useCatalog } from "./CatalogContext";
import { SearchableSelect } from "./SearchableSelect";

// Configure PDF.js worker for production
if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface ProductImage {
    id: string;
    url: string;
}

interface TextBlock {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PageData {
    imageUrl: string;
    text: string;
    textBlocks: TextBlock[];
    subImages?: { preview: string; ref: string }[];
    pageNumber: number;
}

interface ProductData {
    sku: string;
    ean?: string;
    parentSku?: string;
    title: string;
    description: string;
    docDescription: string;
    price: string;
    category: string;
    brand: string;
    dimensions: string;
    weight: string;
    material: string;
    bulletPoints: string;
    seoAiText?: string;
    categoryId?: number | null;
    subCategoryId?: number | null;
    subSubCategoryId?: number | null;
    images: ProductImage[];
    extraFields?: { [key: string]: string };
}

export default function WorkspaceClient() {
    const searchParams = useSearchParams();




    const loadExistingCatalog = async (id: number) => {
        setIsProcessing(true);
        try {
            const resp = await axios.get(`/api/catalogues/${id}`);
            const catalogue = resp.data;
            setCatalogId(catalogue.id);
            setSearchSources(catalogue.searchSources || []);
            setProducts(catalogue.products.map((p: any) => ({
                id: p.id,
                sku: p.sku,
                ean: p.ean || "",
                parentSku: p.parentSku || "",
                title: p.title || p.name || "",
                description: p.description || "",
                docDescription: p.docDescription || "",
                price: p.price || "",
                category: p.category || "",
                brand: p.brand || "",
                dimensions: p.dimensions || "",
                weight: p.weight || "",
                material: p.material || "",
                bulletPoints: p.bulletPoints || "",
                images: p.images.map((img: any) => ({
                    id: img.id.toString(),
                    url: img.imageUrl
                }))
            })));
            await extractFromPdf(catalogue.filePath);
        } catch (err: any) {
            console.error("Error loading catalogue", err);
            const msg = err.response?.data?.details || err.message;
            toast.error(`Errore caricamento: ${msg}`);
            if (msg.includes("otherFields")) {
                toast.warning("DATABASE ALERT: Esaurire lo script 'db-push' su Plesk per sincronizzare le tabelle.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const {
        catalogId, setCatalogId,
        products, setProducts,
        pdfPages, setPdfPages,
        skuToPageMap, setSkuToPageMap,
        currentPdfUrl, setCurrentPdfUrl,
        isProcessing, setIsProcessing
    } = useCatalog();

    const [wsSearchTerm, setWsSearchTerm] = useState("");
    const [isSyncingPages, setIsSyncingPages] = useState(false);
    const [activeField, setActiveField] = useState<keyof ProductData | null>("sku");
    const [currentProduct, setCurrentProduct] = useState<ProductData>({
        sku: "", ean: "", parentSku: "", title: "", description: "", docDescription: "",
        price: "", category: "", brand: "", dimensions: "", weight: "", material: "",
        bulletPoints: "", images: []
    });

    const [allDBProducts, setAllDBProducts] = useState<any[]>([]);
    const [currentView, setCurrentView] = useState<'workspace' | 'erp' | 'asset-matcher'>('workspace');
    const [isLoadingERP, setIsLoadingERP] = useState(false);
    const [csvMasterList, setCsvMasterList] = useState<any[]>([]);
    const [extraColumns, setExtraColumns] = useState<string[]>([]);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvMapping, setCsvMapping] = useState<{ [key: string]: string }>({
        sku: "SKU", ean: "EAN", title: "Titolo", docDescription: "Descrizione documentale",
        price: "Prezzo", brand: "Brand", dimensions: "Dimensioni", weight: "Peso",
        material: "Materiale", category: "Categoria", description: "Analisi AI (Lungo)",
        seoAiText: "Analisi AI (Breve)", image1: "Link Immagine 1", image2: "Link Immagine 2"
    });
    const [showMapping, setShowMapping] = useState(false);
    const [activePicker, setActivePicker] = useState<{ type: 'text' | 'image' | 'pdf', row: number, field: string } | null>(null);
    const [isQuickPdfOpen, setIsQuickPdfOpen] = useState(false);
    const [isDeepSearchOpen, setIsDeepSearchOpen] = useState(false);
    const [isSearchingDeep, setIsSearchingDeep] = useState(false);
    const [deepSearchResults, setDeepSearchResults] = useState<any[]>([]);
    const [pdfSearchFocus, setPdfSearchFocus] = useState<string | null>(null);
    const [pickerSearch, setPickerSearch] = useState("");
    const [displayLimit, setDisplayLimit] = useState(30);
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [newColumnName, setNewColumnName] = useState("");
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'info' | 'images' | 'history'>('info');
    const [projectName, setProjectName] = useState("Nuovo Progetto");

    const [currencyToClean, setCurrencyToClean] = useState<string>("");
    const [translateTargetLang, setTranslateTargetLang] = useState<string>("en");
    const [translateTargetField, setTranslateTargetField] = useState<string>("all");
    const [isTranslating, setIsTranslating] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState<number | null>(null);
    const [pickerSourceMode, setPickerSourceMode] = useState<'pdf' | 'web' | 'file' | 'folder'>('pdf');
    const [pickerPageIdx, setPickerPageIdx] = useState(0);
    const [webResults, setWebResults] = useState<any[]>([]);
    const [isSearchingWeb, setIsSearchingWeb] = useState(false);
    const [isSearchingPdfAi, setIsSearchingPdfAi] = useState(false);
    const [pdfAiMatches, setPdfAiMatches] = useState<{ pageIdx: number, preview: string, ref: string, score: number }[] | null>(null);
    const [newFieldName, setNewFieldName] = useState("");

    const saveImageToServer = async (url: string, sku: string): Promise<string> => {
        if (!url || url.startsWith('PAGE_REF_')) return url;
        try {
            const resp = await axios.post('/api/storage/save-image', { imageUrl: url, sku });
            return resp.data.localUrl;
        } catch (err) {
            console.error("Failed to save image to server:", err);
            return url;
        }
    };

    // New ERP and Search States
    const [searchSources, setSearchSources] = useState<any[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [assetBaseUrl, setAssetBaseUrl] = useState("");
    const [assetExtension, setAssetExtension] = useState(".jpg");
    const [isMatchingAssets, setIsMatchingAssets] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any | null>(null);
    const [productHistory, setProductHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [erpSearchQuery, setErpSearchQuery] = useState("");
    const [allCategories, setAllCategories] = useState<any[]>([]);

    const fetchCategories = async () => {
        try {
            const res = await axios.get('/api/categories?all=true');
            setAllCategories(res.data);
        } catch (err) { }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleAddCategory = async (name: string, parentId: number | null, level: 1 | 2 | 3) => {
        try {
            const res = await axios.post('/api/categories', { name, parentId });
            setAllCategories([...allCategories, res.data]);
            if (level === 1) setCurrentProduct({ ...currentProduct, categoryId: res.data.id, subCategoryId: null, subSubCategoryId: null });
            if (level === 2) setCurrentProduct({ ...currentProduct, subCategoryId: res.data.id, subSubCategoryId: null });
            if (level === 3) setCurrentProduct({ ...currentProduct, subSubCategoryId: res.data.id });
            toast.success("Categoria creata!");
        } catch (err) {
            toast.error("Errore creazione categoria");
        }
    };
    const [pickerSearchQuery, setPickerSearchQuery] = useState("");
    const [useGoogleShopping, setUseGoogleShopping] = useState(false);

    // Smart Positioning Effect
    useEffect(() => {
        if (activePicker?.type === 'image' && pdfPages.length > 0) {
            const product = products[activePicker.row];
            if (product?.sku) {
                // If we already indexed this SKU, use it
                if (skuToPageMap[product.sku] !== undefined) {
                    setPickerPageIdx(skuToPageMap[product.sku]);
                } else {
                    // One-time search if not indexed
                    const pageIdx = pdfPages.findIndex((page: PageData) =>
                        page.textBlocks.some((block: TextBlock) =>
                            block.str.toLowerCase().includes(product.sku.toLowerCase())
                        )
                    );
                    if (pageIdx !== -1) {
                        setPickerPageIdx(pageIdx);
                        setSkuToPageMap(prev => ({ ...prev, [product.sku]: pageIdx }));
                    }
                }
            }
        }
    }, [activePicker, pdfPages, products, skuToPageMap]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const saveSearchSources = async (sources: any[]) => {
        if (!catalogId) return;
        try {
            await axios.patch(`/api/catalogues/${catalogId}`, { searchSources: sources });
            setSearchSources(sources);
            toast.success("Sorgenti di ricerca aggiornate");
        } catch (err) {
            toast.error("Errore nel salvataggio delle sorgenti");
        }
    };

    const handleWebSearch = async (product: any, manualQuery?: string, isShopping = false) => {
        setIsSearchingWeb(true);
        setWebResults([]);
        try {
            const query = (manualQuery || product.sku).trim();
            // Pass project-specific sources to the search API
            const sourcesQuery = searchSources.map(s => s.url).join(',');
            const response = await axios.get(`/api/search-images?q=${encodeURIComponent(query)}&sources=${encodeURIComponent(sourcesQuery)}&shopping=${isShopping || useGoogleShopping}`);
            setWebResults(response.data.images || []);
        } catch (error) {
            console.error("Web search failed:", error);
            toast.error("Errore nella ricerca web");
        } finally {
            setIsSearchingWeb(false);
        }
    };

    const calculateImageSimilarity = (src1: string, src2: string): Promise<number> => {
        return new Promise((resolve) => {
            const img1 = new Image();
            const img2 = new Image();
            let loaded = 0;

            const compare = () => {
                const getPixels = (img: HTMLImageElement) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 16;
                    canvas.height = 16;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return new Float32Array(256);
                    ctx.drawImage(img, 0, 0, 16, 16);
                    const data = ctx.getImageData(0, 0, 16, 16).data;
                    const grays = new Float32Array(256);
                    for (let i = 0; i < 256; i++) {
                        grays[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
                    }
                    return grays;
                };

                try {
                    const px1 = getPixels(img1);
                    const px2 = getPixels(img2);
                    let diff = 0;
                    for (let i = 0; i < 256; i++) {
                        diff += Math.pow(px1[i] - px2[i], 2);
                    }
                    const score = 100 - (Math.sqrt(diff / 256) / 255) * 100;
                    resolve(score);
                } catch {
                    resolve(0);
                }
            };

            img1.crossOrigin = "anonymous";
            img2.crossOrigin = "anonymous";
            img1.onload = () => { loaded++; if (loaded === 2) compare(); };
            img2.onload = () => { loaded++; if (loaded === 2) compare(); };
            img1.onerror = () => resolve(0);
            img2.onerror = () => resolve(0);

            // Use our proxy for external URLs to avoid canvas cors taint
            const proxify = (url: string) => url && typeof url === 'string' && url.startsWith('http') && !url.includes(window.location.host)
                ? `/api/proxy-image?url=${encodeURIComponent(url)}`
                : url || '';

            img1.src = proxify(src1);
            img2.src = proxify(src2);
        });
    };

    const handlePdfAiMatch = async (product: any) => {
        // Cerca la migliore immagine di riferimento (web o locale)
        const targetImg = product.images.find((img: any) => img && img.url && typeof img.url === 'string' && !img.url.startsWith('PAGE_REF_') && img.url !== 'LOCAL_SESSION_ASSET');
        if (!targetImg) {
            toast.warning("Nessuna immagine di riferimento valida (caricata da web o cartella) per questo prodotto.");
            return;
        }

        setIsSearchingPdfAi(true);
        setPdfAiMatches(null);
        setPickerPageIdx(0); // non strettamente necessario ma pulito
        const toastId = toast.loading("Scansione Retina AI: Analizzo tutte le pagine PDF...");

        try {
            const matches: { pageIdx: number; preview: string; ref: string; score: number }[] = [];

            for (let pageIdx = 0; pageIdx < pdfPages.length; pageIdx++) {
                const page = pdfPages[pageIdx];
                if (!page.subImages) continue;

                for (const subImg of page.subImages) {
                    const score = await calculateImageSimilarity(targetImg.url, subImg.preview);
                    // Abbassato leggermente threshold considerando sfondi etc.
                    if (score > 60) {
                        matches.push({ pageIdx, preview: subImg.preview, ref: subImg.ref, score });
                    }
                }
            }

            matches.sort((a, b) => b.score - a.score);
            setPdfAiMatches(matches.slice(0, 15)); // top 15 results
            toast.dismiss(toastId);

            if (matches.length > 0) {
                toast.success(`Trovate ${matches.length} occorrenze simili nel PDF!`);
            } else {
                toast.error("Nessuna corrispondenza visiva trovata nel PDF.");
            }
        } catch (err) {
            console.error(err);
            toast.dismiss(toastId);
            toast.error("Errore durante la scansione AI visiva.");
        } finally {
            setIsSearchingPdfAi(false);
        }
    };

    const handleAutoFillData = async (product: any, idx: number) => {
        const loadingId = toast.loading(`Ricerca dati per ${product.sku}...`);
        try {
            let updatedProduct = { ...product };
            let updatedFields = 0;

            // 1. LOCAL SEARCH in PDF Content (if available)
            const pdfMatch = pdfPages.find(page => page.text.toLowerCase().includes(product.sku.toLowerCase()));
            if (pdfMatch && updatedProduct.images.length === 0) {
                const pageRel = `PAGE_REF_${pdfMatch.pageNumber}`;
                updatedProduct.images = [{ id: `pdf-${pdfMatch.pageNumber}`, url: pageRel }];
                updatedFields++;

                // Try to extract a title from the text near the SKU
                const lines = pdfMatch.text.split('\n');
                const skuLine = lines.find((l: string) => l.toLowerCase().includes(product.sku.toLowerCase()));
                if (skuLine && (!updatedProduct.title || updatedProduct.title.trim() === '')) {
                    updatedProduct.title = skuLine.replace(product.sku, '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().substring(0, 50);
                    updatedFields++;
                }
            }

            const sourcesQuery = searchSources.map(s => s.url).join(',');
            // Enable shopping forcefully if useGoogleShopping is true globally
            const response = await axios.get(`/api/search-images?q=${encodeURIComponent(product.sku)}&sources=${encodeURIComponent(sourcesQuery)}&shopping=${useGoogleShopping}`);
            const images = response.data.images || [];

            // Find the best data from all image results
            const bestData = images.reduce((acc: any, img: any) => {
                if (img.productData) {
                    Object.keys(img.productData).forEach(key => {
                        if (img.productData[key] && !acc[key]) {
                            acc[key] = img.productData[key];
                        }
                    });
                }
                return acc;
            }, {});

            if (bestData.price && (!updatedProduct.price || updatedProduct.price === '€ 0.00' || updatedProduct.price.trim() === '')) {
                updatedProduct.price = bestData.price;
                updatedFields++;
            }
            if (bestData.description && (!updatedProduct.description || updatedProduct.description.trim() === '')) {
                updatedProduct.description = bestData.description;
                updatedFields++;
            }
            if (bestData.title && (!updatedProduct.title || updatedProduct.title.trim() === '')) {
                updatedProduct.title = bestData.title;
                updatedFields++;
            }

            // Sync other advanced fields dynamically
            ['brand', 'category', 'weight', 'dimensions', 'material'].forEach(field => {
                if (bestData[field] && (!updatedProduct[field] || updatedProduct[field].trim() === '')) {
                    updatedProduct[field] = bestData[field];
                    updatedFields++;
                }
            });

            // Extract extra premium fields
            const premiumFields = ['Materiale', 'Colore', 'Dimensioni', 'Peso', 'Design', 'Consigli', 'Circonferenza'];
            premiumFields.forEach(f => {
                const key = f.toLowerCase();
                if (bestData[key] && !updatedProduct.extraFields?.[f]) {
                    updatedProduct.extraFields = {
                        ...(updatedProduct.extraFields || {}),
                        [f]: bestData[key]
                    };
                    if (!allDynamicColumns.some(c => c.label === f)) {
                        setExtraColumns(prev => [...prev, f]);
                    }
                    updatedFields++;
                }
            });

            if (updatedFields > 0) {
                const newProducts = [...products];
                newProducts[idx] = updatedProduct;
                setProducts(newProducts);
                toast.dismiss(loadingId);
                toast.success(`Aggiornati ${updatedFields} campi per ${product.sku}!`);
            } else {
                toast.dismiss(loadingId);
                toast.error(`Nessun nuovo dato trovato per ${product.sku}`);
            }

        } catch (error) {
            console.error("Auto fill failed:", error);
            toast.dismiss(loadingId);
            toast.error("Errore nel recupero dati");
        }
    };

    const getSearchQuery = (product: any) => {
        if (product.images?.length > 0) return `${product.sku} ${product.title || ""}`.trim();
        if (product.sku) return product.sku;
        return product.title || "";
    };

    const handleSmartSearch = (product: any, idx: number, source: 'pdf' | 'folder' | 'web' | 'google_shopping') => {
        const q = getSearchQuery(product);
        if (source === 'pdf') {
            setIsQuickPdfOpen(true);
            setPdfSearchFocus(product.sku);
            return;
        }
        if (source === 'google_shopping') {
            window.open(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`, '_blank');
            return;
        }

        const firstEmpty = [0, 1, 2, 3].find(s => !product.images[s]) ?? 0;
        setActivePicker({ type: 'image', row: idx, field: `slot-${firstEmpty}` });
        setPickerSearchQuery(q);
        setPickerSourceMode(source);
        if (source === 'web' && webResults.length === 0) {
            handleWebSearch(product, q);
        }
    };

    const loadERPData = async () => {
        setIsLoadingERP(true);
        try {
            const resp = await axios.get('/api/products');
            if (Array.isArray(resp.data)) {
                setAllDBProducts(resp.data);
            } else {
                console.error("Dati ricevuti non validi dal PIM HUB Hub:", resp.data);
                toast.error("Errore: Impossibile recuperare i dati del database PIM.");
            }
        } catch (err) {
            console.error("Error loading ERP data", err);
            toast.error("Errore nel caricamento del database");
        } finally {
            setIsLoadingERP(false);
        }
    };

    useEffect(() => {
        if (currentView === 'erp') {
            loadERPData();
        }
    }, [currentView]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        // Restore state from localStorage
        const savedCatalogId = localStorage.getItem("pdf_catalog_id");
        const savedProducts = localStorage.getItem("pdf_catalog_products");

        if (savedCatalogId) {
            const parsedId = parseInt(savedCatalogId);
            setCatalogId(parsedId);
            loadExistingCatalog(parsedId);
        }

        if (savedProducts) {
            try {
                setProducts(JSON.parse(savedProducts));
                toast.info("Sessione ripristinata dal database locale.");
            } catch (e) {
                console.error("Local storage restore error:", e);
                localStorage.removeItem("pdf_catalog_products");
            }
        }

        const handleGlobalClick = (e: MouseEvent) => {
            // If we are clicking on an element that isn't part of a picker or trigger, close active picker
            const target = e.target as HTMLElement;
            if (!target.closest('.relative')) {
                setActivePicker(null);
            }
        };

        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    const resolveImageUrl = (url: string) => {
        if (url && typeof url === 'string' && url.startsWith("PAGE_REF_")) {
            const idx = parseInt(url.split("_")[2]) - 1;
            return pdfPages[idx]?.imageUrl || "";
        }
        return url;
    };

    const resolveAssetUrl = (baseUrl: string, sku: string, ext: string) => {
        if (!baseUrl) return "";
        let processedBase = baseUrl.trim();
        processedBase = processedBase.endsWith('/') ? processedBase : `${processedBase}/`;
        if (processedBase && typeof processedBase === 'string' && processedBase.startsWith('/public/')) {
            processedBase = processedBase.replace('/public', '');
        }
        return encodeURI(`${processedBase}${sku.trim()}${ext}`);
    };

    const systemFieldsToSync = ['brand', 'dimensions', 'weight', 'material', 'category', 'bulletPoints', 'description', 'seoAiText'];
    const activeMappedFields = systemFieldsToSync.filter(f => csvMapping[f] && csvHeaders.includes(csvMapping[f]));

    const allDynamicColumns = [
        ...activeMappedFields.map(f => {
            const labels: any = {
                brand: 'Marca',
                dimensions: 'Dimensioni',
                weight: 'Peso',
                material: 'Materiale',
                category: 'Categoria',
                bulletPoints: 'Caratteristiche principali / bullet point',
                description: 'Analisi AI'
            };
            return { key: f, label: labels[f] || f, isSystem: true };
        }),
        ...extraColumns.map(col => ({ key: col, label: col, isSystem: false }))
    ];

    // Persist state to localStorage with overflow safety
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                if (catalogId) localStorage.setItem("pdf_catalog_id", catalogId.toString());
                if (products.length > 0) {
                    const sanitized = products.map((p, pIdx) => ({
                        ...p,
                        images: (p.images || []).map((img: ProductImage) => ({
                            ...img,
                            url: img.url && typeof img.url === 'string' && img.url.startsWith("data:image") ? "LOCAL_SESSION_ASSET" : img.url
                        }))
                    }));
                    localStorage.setItem("pdf_catalog_products", JSON.stringify(sanitized));
                }
            } catch (err) { console.error(err); }
        }, 1000); // 1s Debounce for persistence
        return () => clearTimeout(timer);
    }, [catalogId, products]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);

        try {
            // Leggiamo i dati localmente prima della fetch per evitare stream locckati dal body upload
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Upload as raw binary stream to bypass Next.js JSON size limits
            const resp = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: uint8Array // Invia direttamente il typed array per max stabilità
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || `Upload failed with status ${resp.status}`);
            }

            const data = await resp.json();
            setCatalogId(data.catalogId);

            if (csvMasterList.length === 0) {
                toast.info("Dati listino assenti: il PDF verrà visualizzato ma nessun prodotto verrà auto-mappato.");
            }

            // Pass local binary to extractFromPdf to bypass any fetch/URL errors from NextJS
            await extractFromPdf(data.filePath, uint8Array);
        } catch (err: any) {
            const errorMsg = err.message || "Caricamento fallito";
            toast.error(`System Error: ${errorMsg}`);
            console.error("Critical Upload Error:", err);
        } finally {
            setIsProcessing(false);
            // Reset input so the same file can be selected again
            if (e.target) e.target.value = '';
        }
    };

    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const ab = evt.target?.result;
            const wb = XLSX.read(ab, { type: 'array' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            if (data.length > 0) {
                const headers = Object.keys(data[0] as object);
                setCsvHeaders(headers);
                setCsvMasterList(data);

                // Intelligent Auto-Mapping
                const newMapping = { ...csvMapping };
                const searchMapping: { [key: string]: string[] } = {
                    sku: ['sku', 'codice', 'cod', 'item', 'art', 'id'],
                    ean: ['ean', 'barcode', 'codice a barre', 'gtin'],
                    title: ['titolo', 'title', 'nome', 'name', 'item name', 'prodotto', 'articolo'],
                    docDescription: ['descrizione documentale', 'descrizione estesa', 'descrizione doc', 'estesa', 'description doc', 'descrizione'],
                    price: ['prezzo', 'price', 'listino', 'netto'],
                    brand: ['marca', 'brand', 'produttore', 'vendor'],
                    dimensions: ['dimensioni', 'dimensions', 'misura', 'formato', 'size'],
                    weight: ['peso', 'weight', 'kg', 'grammi'],
                    material: ['materiale', 'material', 'finitura', 'composizione']
                };

                headers.forEach(h => {
                    const lowH = h.toLowerCase();
                    for (const [field, patterns] of Object.entries(searchMapping)) {
                        if (patterns.some(p => lowH.includes(p) || p.includes(lowH))) {
                            newMapping[field] = h;
                            break;
                        }
                    }
                });

                setCsvMapping(newMapping);
                setShowMapping(true);
                toast.success(`Listino CSV caricato: ${data.length} voci. Auto-mapping completato.`);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleBulkTranslate = async () => {
        if (!products.length) return;
        setIsTranslating(true);
        const updatedProducts = [...products];

        try {
            for (let i = 0; i < updatedProducts.length; i++) {
                const p = updatedProducts[i];
                const fields = translateTargetField === 'all'
                    ? ['title', 'docDescription', ...extraColumns]
                    : [translateTargetField];

                for (const field of fields) {
                    const val = (p as any)[field] || p.extraFields?.[field];
                    if (val && typeof val === 'string') {
                        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translateTargetLang}&dt=t&q=${encodeURIComponent(val.substring(0, 1000))}`;
                        const res = await fetch(url);
                        const data = await res.json();
                        if (data && data[0]) {
                            const translated = data[0].map((x: any) => x[0]).join('');
                            if (fields.includes(field) && field !== 'title' && field !== 'docDescription') {
                                p.extraFields = { ...p.extraFields, [field]: translated };
                            } else {
                                (p as any)[field] = translated;
                            }
                        }
                    }
                }
            }
            setProducts(updatedProducts);
            toast.success(`Traduzione completata con successo`);
        } catch (err) {
            console.error(err);
            toast.error("Errore durante la traduzione dei campi.");
        } finally {
            setIsTranslating(false);
        }
    };

    const handleGenerateAIDescription = async (idx: number, product: ProductData) => {
        setIsGeneratingAI(idx);
        const toastId = 'ai-desc-ws';
        toast.loading("L'AI sta scrivendo la descrizione...", { toastId });
        try {
            const { images, extraFields, docDescription, ...cleanProductData } = product;

            const response = await fetch("/api/ai/describe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productData: {
                        ...cleanProductData,
                        docDescription: docDescription?.substring(0, 2000) || "",
                        extraFieldsPreview: extraFields ? Object.entries(extraFields).map(([k, v]) => `${k}: ${v}`).join(", ").substring(0, 1000) : ""
                    },
                    language: translateTargetLang
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const detail = errData.details || errData.error || "Errore sconosciuto dal server";
                throw new Error(`AI FAIL: ${detail}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let accumulated = "";

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value, { stream: true });
                    accumulated += text;

                    // Parse parts using delimiters
                    const shortDescMatch = accumulated.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
                    const descMatch = accumulated.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
                    const bulletMatch = accumulated.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
                    const fieldsMatch = accumulated.match(/---TECHNICAL_FIELDS---([\s\S]*?)$/);

                    let newShortDescription = "";
                    let newDescription = "";
                    let newBullets = "";
                    let parsedFields: Record<string, string> = {};

                    if (shortDescMatch) {
                        newShortDescription = shortDescMatch[1].trim();
                    }

                    if (descMatch) {
                        newDescription = descMatch[1].trim();
                    }

                    if (bulletMatch) {
                        newBullets = bulletMatch[1].trim();
                    }

                    if (fieldsMatch) {
                        const fieldsText = fieldsMatch[1].trim();
                        const lines = fieldsText.split('\n');
                        lines.forEach(line => {
                            const [k, ...v] = line.split(':');
                            if (k && v.length > 0) {
                                const key = k.trim();
                                const val = v.join(':').trim();
                                if (val && !val.includes('[Valore]')) {
                                    parsedFields[key] = val;
                                }
                            }
                        });
                    }

                    setProducts(prev => {
                        const next = [...prev];
                        if (next[idx]) {
                            next[idx] = {
                                ...next[idx],
                                seoAiText: newShortDescription || next[idx].seoAiText,
                                description: newDescription || (accumulated.includes('---TECHNICAL_FIELDS---') ? "" : accumulated.replace('---DESCRIPTION---', '').trim()),
                                bulletPoints: newBullets || next[idx].bulletPoints,
                                extraFields: {
                                    ...(next[idx].extraFields || {}),
                                    ...parsedFields
                                }
                            };
                        }
                        return next;
                    });
                }
            }

            toast.dismiss(toastId);
            toast.success("Scheda Prodotto generata!");
        } catch (error: any) {
            console.error(error);
            const msg = error.message || "Errore di connessione";
            toast.error(`Errore AI: ${msg}`, { toastId });
        } finally {
            setIsGeneratingAI(null);
        }
    };

    const applyCvsMapping = () => {
        if (!csvMasterList.length) {
            toast.warning("Nessun listino caricato.");
            return;
        }

        const skuMappedField = csvMapping.sku;
        if (!skuMappedField) {
            toast.warning("Mapping Error: Identifica la colonna SKU.");
            return;
        }

        // Add global cleanup to master list directly for the price to show perfectly in activePickers
        if (csvMapping.price) {
            const priceHeader = csvMapping.price;
            csvMasterList.forEach(row => {
                let val = row[priceHeader];
                if (val && typeof val === 'string') {
                    if (currencyToClean) {
                        val = val.replace(new RegExp(currencyToClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
                    }
                    val = val.replace(/â\s*¬/gi, '').replace(/€/g, '').trim();
                    row[priceHeader] = val;
                }
            });
        }

        const newProducts = [...products];
        const systemFieldsKeys = ['ean', 'title', 'docDescription', 'price', 'category', 'brand', 'dimensions', 'weight', 'material', 'bulletPoints', 'description', 'seoAiText'];

        // Map existing products
        products.forEach((p, idx) => {
            const match = csvMasterList.find(row => {
                const itemSku = String(row[skuMappedField] || "").trim().toLowerCase();
                const productSku = String(p.sku || "").trim().toLowerCase();
                return itemSku === productSku && itemSku !== "";
            });

            if (match) {
                const updated = { ...p };
                // Map system fields
                systemFieldsKeys.forEach(field => {
                    const h = csvMapping[field];
                    if (h && match[h] !== undefined && match[h] !== null) {
                        let val = String(match[h]);
                        if (field === 'price') {
                            if (currencyToClean) {
                                val = val.replace(new RegExp(currencyToClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
                            }
                            // Clean common encoding artifacts like â ¬ (from €)
                            val = val.replace(/â\s*¬/gi, '').replace(/€/g, '').trim();
                        }
                        (updated as any)[field] = val;
                    }
                });
                // Map extras
                extraColumns.forEach(ex => {
                    const h = csvMapping[ex];
                    if (h && match[h]) {
                        updated.extraFields = { ...(updated.extraFields || {}), [ex]: String(match[h]) };
                    }
                });
                // Map images
                const csvImages: ProductImage[] = [];
                ['image1', 'image2', 'image3', 'image4'].forEach((imgKey, i) => {
                    const h = csvMapping[imgKey];
                    if (h && match[h]) {
                        const url = String(match[h]).trim();
                        // ensure we don't duplicate
                        if (url && !csvImages.some(img => img.url === url)) {
                            csvImages.push({ id: `csv-${Date.now()}-${i}-${p.sku}`, url });
                        }
                    }
                });

                // CSV images should be AT THE FRONT (Highest priority)
                const existingFiltered = updated.images.filter((img: ProductImage) => !csvImages.some((cImg: ProductImage) => cImg.url === img.url));
                updated.images = [...csvImages, ...existingFiltered];
                newProducts[idx] = updated;
            }
        });

        // Add NEW products from CSV that aren't in the list
        csvMasterList.forEach((row: any) => {
            const rowSku = String(row[skuMappedField] || "").trim();
            if (!rowSku) return;

            const exists = newProducts.some((p: ProductData) => p.sku.trim().toLowerCase() === rowSku.toLowerCase());
            if (!exists) {
                let pPrice = String(row[csvMapping.price] || "");
                if (currencyToClean) {
                    pPrice = pPrice.replace(new RegExp(currencyToClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
                }
                // Global price clean
                pPrice = pPrice.replace(/â\s*¬/gi, '').replace(/€/g, '').trim();

                const newProd: ProductData = {
                    sku: rowSku,
                    title: String(row[csvMapping.title] || ""),
                    description: String(row[csvMapping.description] || ""),
                    seoAiText: String(row[csvMapping.seoAiText] || ""),
                    docDescription: String(row[csvMapping.docDescription] || ""),
                    price: pPrice,
                    category: String(row[csvMapping.category] || "Generale"),
                    brand: String(row[csvMapping.brand] || ""),
                    dimensions: String(row[csvMapping.dimensions] || ""),
                    weight: String(row[csvMapping.weight] || ""),
                    material: String(row[csvMapping.material] || ""),
                    bulletPoints: String(row[csvMapping.description] || ""),
                    images: [],
                    extraFields: {}
                };

                // Add mapping for images
                ['image1', 'image2', 'image3', 'image4'].forEach((imgKey, i) => {
                    const h = csvMapping[imgKey];
                    if (h && row[h]) {
                        newProd.images.push({ id: `csv-new-${Date.now()}-${i}-${rowSku}`, url: String(row[h]) });
                    }
                });

                // Add mapping for extras
                extraColumns.forEach(ex => {
                    const h = csvMapping[ex];
                    if (h && row[h]) {
                        newProd.extraFields![ex] = String(row[h]);
                    }
                });

                newProducts.push(newProd);
            }
        });

        setProducts(newProducts);
        toast.success(`Data Sync: ${newProducts.length} record in workspace.`);
    };

    const bulkMatchSkuAssets = async () => {
        setIsMatchingAssets(true);
        let assetsCount = 0;
        let dataCount = 0;

        const systemFieldsKeys = ['title', 'docDescription', 'price', 'category', 'brand', 'dimensions', 'weight', 'material', 'bulletPoints', 'description', 'seoAiText'];
        const skuMappedField = csvMapping.sku;

        const newProducts = products.map((p: ProductData) => {
            if (!p.sku) return p;
            let updated = { ...p };
            const cleanSku = p.sku.trim();

            // 1. Sync Text Data from CSV if match exists
            if (skuMappedField && csvMasterList.length > 0) {
                const match = csvMasterList.find(row =>
                    String(row[skuMappedField] || "").trim().toLowerCase() === cleanSku.toLowerCase()
                );
                if (match) {
                    dataCount++;
                    // Sync system fields
                    systemFieldsKeys.forEach(field => {
                        const h = csvMapping[field];
                        if (h && match[h]) {
                            let val = String(match[h]);
                            if (field === 'price') {
                                if (currencyToClean) {
                                    val = val.replace(new RegExp(currencyToClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
                                }
                                val = val.replace(/â\s*¬/gi, '').replace(/€/g, '').trim();
                            }
                            (updated as any)[field] = val;
                        }
                    });
                    // Sync extras
                    extraColumns.forEach(ex => {
                        const h = csvMapping[ex];
                        if (h && match[h]) {
                            updated.extraFields = { ...(updated.extraFields || {}), [ex]: String(match[h]) };
                        }
                    });
                }
            }

            // 2. Sync Images from Base Folder
            if (assetBaseUrl) {
                const fullUrl = resolveAssetUrl(assetBaseUrl, cleanSku, assetExtension);
                const exists = updated.images.some((img: ProductImage) => img.url === fullUrl);
                if (!exists) {
                    assetsCount++;
                    const newImages = [...updated.images];
                    // Folder images should be inserted at the beginning, or just after CSV images
                    // If we have CSV mapped images they are highest priority, so unshift might mess up. 
                    // To stay safe, let's unshift them unless we know which images are CSV.
                    // For now, put them right after any images that match existing URLs
                    newImages.unshift({ id: `asset-${Date.now()}-${p.sku}`, url: fullUrl });
                    updated.images = newImages;
                }
            }

            return updated;
        });

        setProducts(newProducts);
        setTimeout(() => {
            setIsMatchingAssets(false);
            toast.success(`Associazione completata: ${assetsCount} nuovi immagini e ${dataCount} record dati sincronizzati.`);
        }, 800);
    };

    const extractFromPdf = async (url: string, localData?: Uint8Array) => {
        setIsProcessing(true);
        let normalizedUrl = url || "";
        if (normalizedUrl && !normalizedUrl.startsWith('http') && !normalizedUrl.startsWith('/')) {
            normalizedUrl = '/' + normalizedUrl;
        }

        // Evitiamo di riprocessare se abbiamo già le pagine in Context per questa URL
        if (pdfPages.length > 0 && currentPdfUrl === normalizedUrl) {
            setIsProcessing(false);
            return;
        }

        setCurrentPdfUrl(normalizedUrl);
        try {
            const storageUrl = `/api/storage?path=${encodeURIComponent(normalizedUrl)}`;
            const loadingTask = pdfjsLib.getDocument(localData ? { data: localData } : storageUrl);
            const pdf = await loadingTask.promise;
            const pages: PageData[] = [];
            const tempSkuMap: { [sku: string]: number } = {};

            const toastId = toast.loading(`Analisi PDF in corso: 0/${pdf.numPages} pagine...`, { position: "bottom-left" });

            for (let i = 1; i <= pdf.numPages; i++) {
                if (i % 5 === 0) {
                    toast.update(toastId, { render: `Analisi PDF in corso: ${i}/${pdf.numPages} pagine...` });
                    await new Promise(r => setTimeout(r, 0));
                }

                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.2 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport, canvas: canvas } as any).promise;

                const subImages: { preview: string; ref: string }[] = [];
                const ops = await page.getOperatorList();

                for (let j = 0; j < ops.fnArray.length; j++) {
                    if (ops.fnArray[j] === (pdfjsLib as any).OPS.paintImageXObject ||
                        ops.fnArray[j] === (pdfjsLib as any).OPS.paintInlineImageXObject) {

                        const imgName = ops.argsArray[j][0];
                        try {
                            const imgObj = await page.objs.get(imgName);
                            if (imgObj && (imgObj.data || imgObj.bitmap)) {
                                // SKIP small images (icons, logos) - ignore anything smaller than 100x100
                                if (imgObj.width < 100 || imgObj.height < 100) continue;

                                const imgCanvas = document.createElement("canvas");
                                const ratio = Math.min(100 / imgObj.width, 100 / imgObj.height, 1);
                                imgCanvas.width = imgObj.width * ratio;
                                imgCanvas.height = imgObj.height * ratio;
                                const imgCtx = imgCanvas.getContext("2d");
                                if (imgCtx) {
                                    if (imgObj.bitmap) {
                                        imgCtx.drawImage(imgObj.bitmap, 0, 0, imgCanvas.width, imgCanvas.height);
                                    } else {
                                        const tempCanvas = document.createElement("canvas");
                                        tempCanvas.width = imgObj.width;
                                        tempCanvas.height = imgObj.height;
                                        const tempCtx = tempCanvas.getContext("2d");
                                        if (tempCtx) {
                                            const imageData = tempCtx.createImageData(imgObj.width, imgObj.height);
                                            imageData.data.set(imgObj.data);
                                            tempCtx.putImageData(imageData, 0, 0);
                                            imgCtx.drawImage(tempCanvas, 0, 0, imgCanvas.width, imgCanvas.height);
                                        }
                                    }
                                    subImages.push({
                                        preview: imgCanvas.toDataURL("image/jpeg", 0.3),
                                        ref: imgName
                                    });
                                }
                            }
                        } catch (e) { }
                    }
                }

                const textContent = await page.getTextContent();
                const textBlocks: TextBlock[] = textContent.items.map((item: any) => {
                    const [, , , , tx, ty] = item.transform;
                    return {
                        str: item.str,
                        x: (tx / viewport.width) * 100,
                        y: 100 - (ty / viewport.height) * 100,
                        width: (item.width / viewport.width) * 100,
                        height: (item.height / viewport.height) * 100
                    };
                });

                textBlocks.forEach((b: TextBlock) => {
                    const matches = b.str.match(/[A-Z0-9-]{3,}/g); // Slightly more relaxed for shorter SKUs
                    if (matches) {
                        matches.forEach((m: string) => {
                            if (!tempSkuMap[m]) tempSkuMap[m] = i - 1;
                        });
                    }
                });

                pages.push({
                    imageUrl: canvas.toDataURL("image/jpeg", 0.45),
                    text: textBlocks.map(b => b.str).join(" "),
                    textBlocks,
                    subImages,
                    pageNumber: i
                });
            }

            setPdfPages(pages);
            setSkuToPageMap(tempSkuMap);
            toast.dismiss(toastId);
            toast.success(`Analisi completata: ${pages.length} pagine processate.`);

            // Trigger Automatic Identification Brain
            setTimeout(() => {
                autoIdentifyRecords(pages);
            }, 1000);
        } catch (err: any) {
            console.error("PDF processing error:", err);
        } finally {
            setIsProcessing(false);
        }
    };

    const extractHighResAsset = async (pageIdx: number, imgRef: string, productIdx: number, slot: number) => {
        if (!currentPdfUrl) return;

        try {
            const loadingTask = pdfjsLib.getDocument(currentPdfUrl);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(pageIdx + 1);

            // Wait slightly for resources to resolve if needed
            let imgObj = null;
            let retries = 0;
            while (retries < 5) {
                try {
                    imgObj = await page.objs.get(imgRef);
                    if (imgObj) break;
                } catch (e) {
                    console.warn(`Retry ${retries + 1} for image ${imgRef}...`);
                    await new Promise(r => setTimeout(r, 800));
                    retries++;
                }
            }

            if (imgObj) {
                const imgCanvas = document.createElement("canvas");
                imgCanvas.width = imgObj.width;
                imgCanvas.height = imgObj.height;
                const imgCtx = imgCanvas.getContext("2d");
                if (imgCtx) {
                    if (imgObj.bitmap) {
                        imgCtx.drawImage(imgObj.bitmap, 0, 0);
                    } else {
                        const imageData = imgCtx.createImageData(imgObj.width, imgObj.height);
                        imageData.data.set(imgObj.data);
                        imgCtx.putImageData(imageData, 0, 0);
                    }
                    const hdUrl = imgCanvas.toDataURL("image/jpeg", 0.9);
                    const localUrl = await saveImageToServer(hdUrl, products[productIdx]?.sku || 'extracted');

                    setProducts((prev: ProductData[]) => {
                        const next = [...prev];
                        const newImages = [...next[productIdx].images];
                        newImages[slot] = { id: Math.random().toString(), url: localUrl };
                        next[productIdx] = { ...next[productIdx], images: newImages };
                        return next;
                    });
                }
            }
        } catch (err) {
            console.error("HD Extraction failed:", err);
        }
    };

    const autoIdentifyRecords = (pages: PageData[]) => {
        toast.info("AI Brain: Analisi semantica in corso...");
        const findings: ProductData[] = [];

        pages.forEach((page, pIdx) => {
            // Group blocks by proximity (primitive OCR-to-JSON grouping)
            const blocks = [...page.textBlocks].sort((a, b) => a.y - b.y || a.x - b.x);

            // SKU Heuristic: Alphanumeric, length 6-15, uppercase dominant
            const skuPattern = /[A-Z0-9\-]{6,20}/;
            const pricePattern = /\d+([.,]\d{2})/;

            blocks.forEach((block, idx) => {
                const text = block.str.trim();

                // SKU Strict: Alphanumeric, length 6-20, NO SPACES allowed
                if (skuPattern.test(text) && text.length >= 6 && !text.includes(" ")) {
                    // Controllo di sicurezza: verifichiamo se lo SKU esiste nel listino caricato
                    // Se non c'è nel listino, lo ignoriamo come richiesto dall'utente
                    const lowerText = text.toLowerCase();
                    const existsInList = csvMasterList.some(item =>
                        String(item[csvMapping.sku] || "").toLowerCase() === lowerText
                    );

                    if (!existsInList) return;

                    // We found a potential SKU seed present in the listino
                    // Look for a Name nearby (next few blocks in same vertical vicinity)
                    const potentialName = blocks.slice(idx + 1, idx + 4)
                        .map(b => b.str)
                        .find(s => s.length > 5 && !skuPattern.test(s)) || "";

                    const potentialPrice = blocks.slice(idx - 5, idx + 10)
                        .map(b => b.str)
                        .find(s => pricePattern.test(s)) || "";

                    // Cross-reference with CSV Master List if available
                    let enrichedName = potentialName;
                    let enrichedPrice = potentialPrice;
                    let extraData = {};

                    if (csvMasterList.length > 0) {
                        const match = csvMasterList.find(item =>
                            String(item[csvMapping.sku] || "").toLowerCase() === text.toLowerCase()
                        );
                        if (match) {
                            enrichedName = match[csvMapping.title] || enrichedName;
                            enrichedPrice = match[csvMapping.price] || enrichedPrice;
                            extraData = match;
                        }
                    }

                    const fields: { [key: string]: string } = {};
                    extraColumns.forEach(col => {
                        const csvCol = csvMapping[col];
                        if (csvCol && extraData) {
                            fields[col] = (extraData as any)[csvCol] || "";
                        }
                    });

                    findings.push({
                        sku: text,
                        title: enrichedName,
                        description: `Identificato automaticamente a pagina ${pIdx + 1}`,
                        docDescription: (extraData as any)[csvMapping.docDescription] || "",
                        price: enrichedPrice,
                        category: "Identificato da AI",
                        brand: (extraData as any)[csvMapping.brand] || "",
                        dimensions: (extraData as any)[csvMapping.dimensions] || "",
                        weight: (extraData as any)[csvMapping.weight] || "",
                        material: (extraData as any)[csvMapping.material] || "",
                        bulletPoints: "",
                        images: [{ id: Math.random().toString(), url: `PAGE_REF_${pIdx + 1}` }],
                        extraFields: fields
                    });
                }
            });
        });

        // Merge findings with existing products. User edits/CSV mapping ALWAYS wins.
        // Images from Drive/Folder (already in products) WIN over PDF images (placed at the end).
        const existingMap = new Map(products.map((p: ProductData) => [p.sku.toLowerCase(), p]));
        const finalProducts = [...products];

        findings.forEach((finding: ProductData) => {
            const lowerSku = finding.sku.toLowerCase();
            if (existingMap.has(lowerSku)) {
                const existing = existingMap.get(lowerSku)!;
                const newImages = [...existing.images];
                finding.images.forEach((fImg: ProductImage) => {
                    if (!newImages.some((img: ProductImage) => img.url === fImg.url)) {
                        newImages.push(fImg);
                    }
                });
                const idx = finalProducts.findIndex((p: ProductData) => p.sku.toLowerCase() === lowerSku);
                if (idx !== -1) {
                    finalProducts[idx] = { ...existing, images: newImages };
                }
            }
        });

        // Avvisiamo solo sui prodotti effettivi riconosciuti e mappati dal listino
        let updatedCount = 0;
        finalProducts.forEach((p: ProductData) => {
            // Conta un prodotto come toccato dal PDF se ha stringhe d'immagine generate da PDF
            if (p.images.some((img: ProductImage) => img.url.startsWith("PAGE_REF_"))) updatedCount++;
        });

        setProducts(finalProducts);
        toast.success(`AI Scan: Immagini riconosciute e associate a ${updatedCount} prodotti del listino.`);
    };

    const syncToDatabase = async () => {
        if (products.length === 0) return;

        setIsProcessing(true);
        try {
            toast.loading("Sincronizzazione Database in corso...");

            let useCatalogId = catalogId;
            if (!useCatalogId) {
                const res = await axios.post('/api/catalogues', { name: projectName });
                useCatalogId = res.data.id;
                setCatalogId(useCatalogId);
            }

            for (const product of products) {
                // Resolve any PAGE_REF_ URLs to actual URLs before saving to DB
                const resolvedImages = (product.images || []).map((img: ProductImage) => ({
                    ...img,
                    url: resolveImageUrl(img.url)
                })).filter((img: ProductImage) => img.url && !img.url.startsWith("PAGE_REF_"));

                await axios.post("/api/products", {
                    ...product,
                    images: resolvedImages,
                    catalogId: useCatalogId
                });
            }

            // Also Sync PDF Pages for Deep Search
            if (pdfPages.length > 0) {
                setIsSyncingPages(true);
                await axios.post("/api/catalogues/sync-pages", {
                    catalogId: useCatalogId,
                    pages: pdfPages
                });
                setIsSyncingPages(false);
            }

            toast.dismiss();
            toast.success(`${products.length} record sincronizzati correttamente.`);
        } catch (err) {
            toast.dismiss();
            toast.error("Errore durante la sincronizzazione massiva.");
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleImageSelection = (imgUrl: string) => {
        const exists = currentProduct.images.find(img => img.url === imgUrl);
        if (exists) {
            setCurrentProduct({
                ...currentProduct,
                images: currentProduct.images.filter(img => img.url !== imgUrl)
            });
        } else {
            setCurrentProduct({
                ...currentProduct,
                images: [...currentProduct.images, { id: Math.random().toString(), url: imgUrl }]
            });
        }
    };

    const handleGlobalDeepSearch = async (sku: string) => {
        setIsSearchingDeep(true);
        setIsDeepSearchOpen(true);
        setPdfSearchFocus(sku);
        const toastId = 'global-deep-search';
        toast.loading(`Ricerca SKu ${sku} nei cataloghi storici...`, { toastId });
        try {
            const res = await axios.get('/api/catalogues/deep-search', { params: { q: sku } });
            setDeepSearchResults(res.data || []);
            toast.update(toastId, { render: `Trovati ${res.data?.length || 0} riferimenti nel database`, type: 'success', isLoading: false, autoClose: 3000 });
        } catch (err) {
            console.error("Deep search failed:", err);
            toast.update(toastId, { render: "Errore nella ricerca profonda", type: 'error', isLoading: false, autoClose: 3000 });
        } finally {
            setIsSearchingDeep(false);
        }
    };

    const handleTextClick = (text: string) => {
        if (activeField) {
            setCurrentProduct(prev => ({
                ...prev,
                [activeField]: prev[activeField] ? `${prev[activeField]} ${text}` : text
            }));
        }
    };

    const saveProduct = async () => {
        if (!currentProduct.sku) {
            toast.warning("Protocol Error: SKU Identifier required.");
            return;
        }

        try {
            let useCatalogId = catalogId;
            if (!useCatalogId) {
                const res = await axios.post('/api/catalogues', { name: projectName });
                useCatalogId = res.data.id;
                setCatalogId(useCatalogId);
            }

            await axios.post("/api/products", {
                ...currentProduct,
                catalogId: useCatalogId
            });

            setProducts([currentProduct, ...products]);
            toast.success(`Matrix Updated: Record ${currentProduct.sku} verified.`);
            setCurrentProduct({
                sku: "", ean: "", parentSku: "", title: "", description: "", seoAiText: "", docDescription: "", price: "", category: "", brand: "",
                dimensions: "", weight: "", material: "", bulletPoints: "", images: []
            });
        } catch (err) {
            console.error(err);
            toast.error("Transmission Error: Failed to commit record.");
        }
    };

    const fetchProductHistory = async (id: string) => {
        setIsLoadingHistory(true);
        try {
            const res = await axios.get(`/api/products/${id}/history`);
            setProductHistory(res.data);
        } catch (err) {
            console.error("Error fetching history:", err);
            toast.error("Errore nel caricamento della cronologia");
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const updateProductInERP = async (updatedProduct: any) => {
        try {
            let useCatalogId = updatedProduct.catalogId || catalogId;
            if (!useCatalogId) {
                const res = await axios.post('/api/catalogues', { name: projectName });
                useCatalogId = res.data.id;
                setCatalogId(useCatalogId);
            }

            await axios.post("/api/products", {
                ...updatedProduct,
                catalogId: useCatalogId,
                images: updatedProduct.images.map((img: any) => ({
                    url: typeof img === 'string' ? img : (img.imageUrl || img.url)
                }))
            });
            toast.success("Prodotto salvato con successo");
            setEditingProduct(null);
            loadERPData();
        } catch (err) {
            console.error(err);
            toast.error("Errore durante il salvataggio");
        }
    };

    const saveAllToERP = async () => {
        if (!products.length) return;
        if (!confirm(`Sincronizzare ${products.length} record su Database PIM? Questa operazione potrebbe richiedere tempo.`)) return;

        setIsMatchingAssets(true);
        const toastId = toast.loading(`Sincronizzazione di ${products.length} record in corso...`, { autoClose: false });

        let success = 0;
        let fail = 0;

        try {
            let useCatalogId = catalogId;
            if (!useCatalogId) {
                const res = await axios.post('/api/catalogues', { name: projectName });
                useCatalogId = res.data.id;
                setCatalogId(useCatalogId);
            }

            for (const p of products) {
                if (!p.sku) continue;
                try {
                    await axios.post("/api/products", { ...p, catalogId: useCatalogId });
                    success++;
                } catch (e) {
                    fail++;
                    console.error(`Save fail for ${p.sku}`, e);
                }
            }
            toast.update(toastId, {
                render: `Sincronizzazione completata: ${success} salvati, ${fail} falliti.`,
                type: "success",
                isLoading: false,
                autoClose: 5000
            });
        } catch (err) {
            toast.update(toastId, {
                render: "Errore durante la sincronizzazione massiva",
                type: "error",
                isLoading: false,
                autoClose: 5000
            });
        } finally {
            setIsMatchingAssets(false);
            loadERPData();
        }
    };

    const deleteProductFromERP = async (sku: string) => {
        if (!confirm(`Sei sicuro di voler eliminare il prodotto ${sku}?`)) return;
        try {
            await axios.delete(`/api/products?sku=${sku}`);
            toast.success("Prodotto eliminato");
            loadERPData();
        } catch (err) {
            console.error(err);
            toast.error("Errore durante l'eliminazione");
        }
    };

    const exportToExcel = () => {
        if (products.length === 0) {
            toast.warning("Matrix Alert: Nessun record da esportare nel workspace attuale.");
            return;
        }

        const dataToExport = products.map(p => {
            const row: any = {
                "SKU Code": p.sku,
                "Titolo": p.title,
                "Prezzo": p.price,
                "Categoria": p.category,
                "Brand": p.brand,
                "Descrizione Documentale": p.docDescription,
                "Caratteristiche principali / bullet point": p.bulletPoints,
                "Analisi AI (Breve)": p.seoAiText,
                "Analisi AI (Lungo)": p.description
            };

            // Add images URLs
            for (let i = 0; i < 4; i++) {
                row[`IMG ${i + 1}`] = p.images[i] ? p.images[i].url : "";
            }

            // Add dynamic extra fields
            if (p.extraFields) {
                Object.entries(p.extraFields).forEach(([key, val]) => {
                    row[key] = val;
                });
            }

            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Catalog Data");

        // Premium Export with Timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `ContentHunter_Export_${timestamp}.xlsx`);
        toast.success("Excel generato con successo! Download avviato.");
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Header / Page Identity */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-3 border-b border-gray-100 bg-white/50 backdrop-blur-xl sticky top-0 z-50 -mx-6 px-6">
                <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-orange-600" />
                        <h1 className="text-xl font-black tracking-tight text-[#111827]">
                            <input
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="Nome Progetto..."
                                className="bg-transparent border-none outline-none focus:ring-0 p-0 w-full hover:bg-gray-50/50 rounded transition-colors"
                            />
                        </h1>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider text-gray-400">
                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-500" /> CSV</span>
                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> PDF</span>
                        <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-300" /> WEB</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-gray-100/50 p-1 rounded-xl border border-gray-200 shadow-inner">
                        <button
                            onClick={() => {
                                if (csvMasterList.length > 0) setShowMapping(!showMapping);
                                else csvInputRef.current?.click();
                            }}
                            className={`px-4 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all ${csvMasterList.length === 0 ? "bg-orange-600 text-white shadow-lg" : "bg-white text-gray-600 border border-gray-200"}`}
                        >
                            <FileText className={`w-3.5 h-3.5 ${csvMasterList.length === 0 ? "text-white" : "text-orange-500"}`} />
                            {csvMasterList.length > 0 ? (showMapping ? "Nascondi Mapping" : "Mapping") : "1. Listino"}
                        </button>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={`px-4 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all ${pdfPages.length === 0 && csvMasterList.length > 0 ? "bg-slate-900 text-white shadow-lg" : "text-gray-500 hover:text-slate-900"}`}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {pdfPages.length === 0 ? "2. PDF" : "PDF OK"}
                        </button>

                        <button
                            onClick={() => setShowSettings(true)}
                            className="px-4 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest flex items-center gap-2 text-gray-400 hover:text-slate-900 transition-all font-mono"
                        >
                            <Globe className="w-3.5 h-3.5 text-blue-400" />
                            Sorgenti
                        </button>
                    </div>

                    <div className="flex items-center gap-2 border-l border-gray-100 pl-3">
                        <button
                            onClick={syncToDatabase}
                            className="bg-orange-600 text-white px-5 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-orange-700 transition-all shadow-md shadow-orange-900/10"
                        >
                            <Sparkles className="w-4 h-4" />
                            Salva
                        </button>
                    </div>
                </div>
            </div>

            <input type="file" ref={fileInputRef} onChange={handleUpload} accept=".pdf" className="hidden" />
            <input type="file" ref={csvInputRef} onChange={handleCSVUpload} accept=".csv,.xlsx,.xls" className="hidden" />

            {/* CSV Mapping Interface */}
            <AnimatePresence>
                {
                    showMapping && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="main-card overflow-hidden bg-orange-50/30 border-orange-100"
                        >
                            <div className="p-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-orange-100 rounded-xl">
                                            <Layers className="w-6 h-6 text-orange-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-[#111827]">Configura Mapping Listino</h3>
                                            <p className="text-sm text-gray-500 font-medium">Associa le colonne del tuo file ai campi del sistema.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={applyCvsMapping}
                                            className="px-6 py-2 bg-white border border-orange-200 text-orange-600 rounded-xl font-bold text-sm hover:bg-orange-50 transition-all flex items-center gap-2"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            Applica Mapping a Righe
                                        </button>
                                        <button
                                            onClick={() => {
                                                applyCvsMapping();
                                                setShowMapping(false);
                                            }}
                                            className="px-6 py-2 bg-orange-600 text-white rounded-xl font-bold text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-200"
                                        >
                                            Conferma e Applica Mapping
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {Object.keys(csvMapping).filter(k => !extraColumns.includes(k)).map((field) => (
                                        <div key={field} className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block ml-1">
                                                Campo: {field.replace(/([A-Z])/g, ' $1').replace(/^image\d+$/, 'Immagine Link').trim().charAt(0).toUpperCase() + field.replace(/([A-Z])/g, ' $1').replace(/^image\d+$/, 'Immagine Link').trim().slice(1)}
                                            </label>
                                            <select
                                                value={csvMapping[field]}
                                                onChange={(e) => setCsvMapping({ ...csvMapping, [field]: e.target.value })}
                                                className="w-full bg-white border border-orange-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all font-bold text-gray-700"
                                            >
                                                <option value="">Nessun Mapping</option>
                                                {csvHeaders.map(h => (
                                                    <option key={h} value={h}>{h}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block ml-1">
                                            Pulisci Valuta (Prezzo)
                                        </label>
                                        <select
                                            value={currencyToClean}
                                            onChange={(e) => setCurrencyToClean(e.target.value)}
                                            className="w-full bg-white border border-orange-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all font-bold text-gray-700"
                                        >
                                            <option value="">Nessuna (Lascia inalterato)</option>
                                            <option value="€">Rimuovi €</option>
                                            <option value="$">Rimuovi $</option>
                                            <option value="£">Rimuovi £</option>
                                            <option value="EUR">Rimuovi EUR</option>
                                            <option value="USD">Rimuovi USD</option>
                                        </select>
                                    </div>
                                    <div className="space-y-4 col-span-full pt-4 border-t border-orange-100">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-black uppercase tracking-widest text-[#111827]">Campi Personalizzati / Extra</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={newFieldName}
                                                    onChange={(e) => setNewFieldName(e.target.value)}
                                                    placeholder="Nome nuovo campo..."
                                                    className="bg-white border border-gray-100 rounded-lg px-4 py-2 text-xs font-bold outline-none focus:border-orange-400"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (!newFieldName.trim()) return;
                                                        setExtraColumns([...extraColumns, newFieldName.trim()]);
                                                        setNewFieldName("");
                                                    }}
                                                    className="p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {extraColumns.map((col) => (
                                        <div key={col} className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-orange-400 block ml-1 flex items-center gap-2">
                                                Campo Extra: {col}
                                                <button
                                                    onClick={() => setExtraColumns(extraColumns.filter(c => c !== col))}
                                                    className="text-red-400 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </label>
                                            <select
                                                value={csvMapping[col] || ""}
                                                onChange={(e) => setCsvMapping({ ...csvMapping, [col]: e.target.value })}
                                                className="w-full bg-white border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all font-bold text-orange-800"
                                            >
                                                <option value="">Nessun Mapping</option>
                                                {csvHeaders.map(h => (
                                                    <option key={h} value={h}>{h}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* ERP Navigation Tabs */}
            < div className="flex items-center gap-4 p-1 bg-gray-100/30 w-fit rounded-2xl border border-gray-100" >
                <button
                    onClick={() => setCurrentView('workspace')}
                    className={`px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${currentView === 'workspace' ? 'bg-white shadow-md text-[#111827] scale-105' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Cpu className="w-4 h-4" />
                    PDF Workspace
                </button>
                <button
                    onClick={() => setCurrentView('asset-matcher')}
                    className={`px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${currentView === 'asset-matcher' ? 'bg-white shadow-md text-[#111827] scale-105' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <HardDrive className="w-4 h-4" />
                    Associa Asset SKU
                </button>
                <button
                    onClick={() => setCurrentView('erp')}
                    className={`px-8 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${currentView === 'erp' ? 'bg-white shadow-md text-[#111827] scale-105' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    <Database className="w-4 h-4" />
                    Gestione ERP
                </button>
            </div >

            <AnimatePresence mode="wait">
                {currentView === 'workspace' ? (
                    <motion.div
                        key="workspace"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-12"
                    >
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
                            {/* PDF Viewer */}
                            <div className="xl:col-span-7 main-card p-10 min-h-[850px] flex flex-col relative overflow-hidden">
                                <div className="flex items-center justify-between mb-10 pb-6 border-b border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                            <FileText className="w-6 h-6 text-gray-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-[#111827]">Visualizzazione PDF</h3>
                                    </div>
                                    {pdfPages.length > 0 && (
                                        <span className="text-[10px] font-black uppercase tracking-widest bg-gray-100 px-4 py-2 rounded-full text-gray-500">
                                            {pdfPages.length} Pagine
                                        </span>
                                    )}
                                </div>

                                {isProcessing ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                                        <div className="w-12 h-12 border-4 border-[#E6D3C1] border-t-transparent rounded-full animate-spin" />
                                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Elaborazione in corso...</p>
                                    </div>
                                ) : pdfPages.length > 0 ? (
                                    <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-12 max-h-[1000px]">
                                        {pdfPages.map((page: PageData, pIdx: number) => (
                                            <div key={pIdx} className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl font-black text-gray-100">0{pIdx + 1}</span>
                                                        <div className="h-px w-12 bg-gray-100" />
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Pagina</span>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleImageSelection(page.imageUrl)}
                                                        className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:bg-[#E6D3C1] hover:text-black transition-all"
                                                    >
                                                        Cattura Immagine
                                                    </button>
                                                </div>
                                                <div className="relative group rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                                                    <img src={page.imageUrl} className="w-full h-auto" />
                                                    <div className="absolute inset-0 z-10">
                                                        {page.textBlocks.map((block: TextBlock, bIdx: number) => (
                                                            <div
                                                                key={bIdx}
                                                                className="absolute cursor-pointer border-2 border-transparent hover:border-[#E6D3C1] hover:bg-[#E6D3C1]/10 rounded transition-all"
                                                                style={{
                                                                    left: `${block.x}%`,
                                                                    top: `${block.y}%`,
                                                                    width: `${block.width}%`,
                                                                    height: `${block.height}%`
                                                                }}
                                                                onClick={() => handleTextClick(block.str)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-24 h-24 bg-white hover:bg-orange-50 hover:border-orange-200 cursor-pointer rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-gray-200 transition-all group shadow-sm active:scale-95"
                                        >
                                            <Plus className="w-10 h-10 text-gray-300 group-hover:text-orange-500 transition-colors" />
                                        </div>
                                        <div className="space-y-2 opacity-50">
                                            <p className="text-sm font-black uppercase tracking-widest text-[#111827]">Sorgente PDF Assente</p>
                                            <p className="text-xs font-bold text-gray-400">Clicca sul + per caricare il documento o trascinalo qui.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Form Editor */}
                            <div className="xl:col-span-5 space-y-10">
                                <div className="main-card p-10 space-y-10">
                                    <div className="flex items-center gap-4 border-b border-gray-100 pb-8">
                                        <div className="p-3 bg-[#E6D3C1]/20 rounded-xl border border-[#E6D3C1]/30">
                                            <Users className="w-6 h-6 text-[#8B735B]" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-[#111827]">Anagrafica Prodotto</h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dettagli tecnico/economici</p>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Codice SKU *</label>
                                            <input
                                                className="clean-input font-mono text-lg"
                                                placeholder="Es: ART-001"
                                                value={currentProduct.sku}
                                                onFocus={() => setActiveField('sku')}
                                                onChange={(e) => setCurrentProduct({ ...currentProduct, sku: e.target.value })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Titolo Prodotto</label>
                                            <input
                                                className="clean-input"
                                                placeholder="Indica il titolo originale..."
                                                value={currentProduct.title}
                                                onFocus={() => setActiveField('title')}
                                                onChange={(e) => setCurrentProduct({ ...currentProduct, title: e.target.value })}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Descrizione Documentale</label>
                                            <textarea
                                                className="clean-input min-h-[80px]"
                                                placeholder="Descrizione tecnica da documento..."
                                                value={currentProduct.docDescription}
                                                onFocus={() => setActiveField('docDescription')}
                                                onChange={(e) => setCurrentProduct({ ...currentProduct, docDescription: e.target.value })}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-gray-700 ml-1">Prezzo</label>
                                                <input
                                                    className="clean-input text-green-600 font-bold"
                                                    placeholder="€ 0.00"
                                                    value={currentProduct.price}
                                                    onFocus={() => setActiveField('price')}
                                                    onChange={(e) => setCurrentProduct({ ...currentProduct, price: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-4 pt-4 border-t border-gray-50">
                                                <h5 className="text-[10px] font-black uppercase tracking-widest text-[#111827]">Classificazione Categorie</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Livello 1 (Root)</label>
                                                        <SearchableSelect
                                                            options={allCategories.filter(c => !c.parentId).map(c => ({ value: c.id, label: c.name }))}
                                                            value={currentProduct.categoryId || null}
                                                            onAddNew={(name) => handleAddCategory(name, null, 1)}
                                                            onChange={(val) => {
                                                                setCurrentProduct({
                                                                    ...currentProduct,
                                                                    categoryId: val ? Number(val) : null,
                                                                    subCategoryId: null,
                                                                    subSubCategoryId: null
                                                                });
                                                            }}
                                                            placeholder="Categoria Root..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Livello 2 (Sub)</label>
                                                        <SearchableSelect
                                                            options={allCategories.filter(c => c.parentId === currentProduct.categoryId).map(c => ({ value: c.id, label: c.name }))}
                                                            value={currentProduct.subCategoryId || null}
                                                            onAddNew={(name) => handleAddCategory(name, currentProduct.categoryId || null, 2)}
                                                            onChange={(val) => {
                                                                setCurrentProduct({
                                                                    ...currentProduct,
                                                                    subCategoryId: val ? Number(val) : null,
                                                                    subSubCategoryId: null
                                                                });
                                                            }}
                                                            placeholder="Sottocategoria..."
                                                            disabled={!currentProduct.categoryId}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Livello 3 (Sub-Sub)</label>
                                                        <SearchableSelect
                                                            options={allCategories.filter(c => c.parentId === currentProduct.subCategoryId).map(c => ({ value: c.id, label: c.name }))}
                                                            value={currentProduct.subSubCategoryId || null}
                                                            onAddNew={(name) => handleAddCategory(name, currentProduct.subCategoryId || null, 3)}
                                                            onChange={(val) => {
                                                                setCurrentProduct({
                                                                    ...currentProduct,
                                                                    subSubCategoryId: val ? Number(val) : null
                                                                });
                                                            }}
                                                            placeholder="LVL 3..."
                                                            disabled={!currentProduct.subCategoryId}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-2 border-t border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs font-black uppercase tracking-widest text-[#111827] ml-1">Caratteristiche / Bullet points</label>
                                                <button
                                                    onClick={() => {
                                                        const arr = (currentProduct.bulletPoints || "").split('\n').filter(b => b.trim());
                                                        arr.push("- ");
                                                        setCurrentProduct({ ...currentProduct, bulletPoints: arr.join('\n') });
                                                    }}
                                                    className="px-2 py-1 bg-[#111827]/10 hover:bg-[#111827]/20 text-[#111827] text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1 transition-all"
                                                >
                                                    <Plus className="w-3 h-3" /> Aggiungi
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                                                {((currentProduct.bulletPoints || "").split('\n').filter(b => b.trim()).length === 0 ? [""] : (currentProduct.bulletPoints || "").split('\n').filter(b => b.trim())).map((bullet, idx) => (
                                                    <div key={idx} className="flex gap-2 group">
                                                        <div className="w-6 h-6 rounded bg-[#111827]/5 flex items-center justify-center text-[#111827] font-black text-[9px] mt-1 shrink-0">{idx + 1}</div>
                                                        <input
                                                            className="clean-input flex-1 !p-2 !text-xs !bg-white focus:!ring-1 focus:!ring-[#111827]"
                                                            placeholder={`Bullet ${idx + 1}...`}
                                                            value={bullet.replace(/^-\s*/, '')}
                                                            onFocus={() => setActiveField('bulletPoints')}
                                                            onChange={(e) => {
                                                                const arr = (currentProduct.bulletPoints || "").split('\n').filter(b => b.trim());
                                                                arr[idx] = e.target.value ? `- ${e.target.value}` : "";
                                                                setCurrentProduct({ ...currentProduct, bulletPoints: arr.join('\n') });
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const arr = (currentProduct.bulletPoints || "").split('\n').filter(b => b.trim());
                                                                arr.splice(idx, 1);
                                                                setCurrentProduct({ ...currentProduct, bulletPoints: arr.join('\n') });
                                                            }}
                                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="text-xs font-bold text-gray-700 ml-1 uppercase tracking-widest opacity-50">Assets Catturati ({currentProduct.images.length})</label>
                                            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                                                {currentProduct.images.map(img => (
                                                    <div key={img.id} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-gray-100 shrink-0 group">
                                                        <img src={img.url} className="w-full h-full object-cover" />
                                                        <button
                                                            onClick={() => toggleImageSelection(img.url)}
                                                            className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="w-5 h-5 text-white" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {currentProduct.images.length === 0 && (
                                                    <div className="w-24 h-24 border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-gray-200">
                                                        <ImageIcon className="w-6 h-6" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={saveProduct}
                                            disabled={!currentProduct.sku}
                                            className="btn-primary w-full py-4 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-20"
                                        >
                                            <CheckCircle2 className="w-5 h-5" />
                                            Salva Record in Anagrafica
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between px-6 text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                                    <div className="flex items-center gap-2">
                                        <Box className="w-3 h-3" />
                                        Database: Connesso
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Cpu className="w-3 h-3" />
                                        Core: v3.4.1
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Registry Table */}
                        <div className="main-card">
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                                        <Database className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-[#111827]">Log Estrazioni Recent</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Asset pronti per l&apos;esportazione finale</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 mr-4 border-r border-gray-200 pr-4">
                                        <select
                                            value={translateTargetField}
                                            onChange={(e) => setTranslateTargetField(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-100 text-gray-700"
                                        >
                                            <option value="all">Tutte le colonne</option>
                                            <option value="title">Titolo</option>
                                            <option value="docDescription">Desc. Documentale</option>
                                            {extraColumns.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={translateTargetLang}
                                            onChange={(e) => setTranslateTargetLang(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-100 text-purple-700"
                                        >
                                            <option value="en">Inglese</option>
                                            <option value="es">Spagnolo</option>
                                            <option value="fr">Francese</option>
                                            <option value="de">Tedesco</option>
                                            <option value="it">Italiano</option>
                                        </select>
                                        <button
                                            onClick={handleBulkTranslate}
                                            disabled={isTranslating || products.length === 0}
                                            className="btn-secondary px-4 py-2 flex items-center gap-2 text-xs font-bold disabled:opacity-50"
                                        >
                                            {isTranslating ? (
                                                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Languages className="w-4 h-4 text-purple-600" />
                                            )}
                                            <span className="text-purple-700">Traduci Voci</span>
                                        </button>
                                    </div>
                                    <AnimatePresence>
                                        {isAddingColumn && (
                                            <motion.div
                                                initial={{ width: 0, opacity: 0 }}
                                                animate={{ width: 200, opacity: 1 }}
                                                exit={{ width: 0, opacity: 0 }}
                                                className="relative flex items-center"
                                            >
                                                <input
                                                    autoFocus
                                                    placeholder="Nome colonna..."
                                                    value={newColumnName}
                                                    onChange={(e) => setNewColumnName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && newColumnName) {
                                                            setExtraColumns([...extraColumns, newColumnName]);
                                                            setNewColumnName("");
                                                            setIsAddingColumn(false);
                                                        }
                                                        if (e.key === 'Escape') setIsAddingColumn(false);
                                                    }}
                                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-100 outline-none pr-8"
                                                />
                                                <button
                                                    onClick={() => setIsAddingColumn(false)}
                                                    className="absolute right-2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <button
                                        onClick={() => setIsAddingColumn(!isAddingColumn)}
                                        className="btn-secondary py-2.5 px-6 flex items-center gap-2 text-xs font-bold"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Aggiungi Colonna
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                            <th className="px-6 py-3">SKU Code</th>
                                            <th className="px-6 py-3">Titolo</th>
                                            <th className="px-6 py-3">Desc. Documentale</th>
                                            {allDynamicColumns.map(col => (
                                                <th key={col.key} className="px-6 py-3">{col.label}</th>
                                            ))}
                                            <th className="px-2 py-3 text-center">IMG 1</th>
                                            <th className="px-2 py-3 text-center">IMG 2</th>
                                            <th className="px-2 py-3 text-center">IMG 3</th>
                                            <th className="px-2 py-3 text-center">IMG 4</th>
                                            <th className="px-6 py-3 text-right">Valutazione</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {products.slice(0, displayLimit).map((p, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-col items-start gap-1.5">
                                                        <span className="font-mono font-black text-white bg-slate-900 px-2 py-1 rounded text-[10px] tracking-tight whitespace-nowrap">{p.sku}</span>
                                                        <button
                                                            onClick={() => handleAutoFillData(p, idx)}
                                                            className="text-[8px] font-black uppercase tracking-wider text-slate-900 hover:text-white flex items-center gap-1 transition-all whitespace-nowrap bg-slate-50 hover:bg-slate-900 px-2 py-0.5 rounded border border-slate-200"
                                                        >
                                                            <Sparkles className="w-2.5 h-2.5" />
                                                            Auto-Compila
                                                        </button>
                                                        <div className="flex flex-col gap-0.5 w-full mt-0.5">
                                                            <div className="flex gap-0.5 w-full">
                                                                <button onClick={() => handleSmartSearch(p, idx, 'pdf')} className="flex-1 text-[7px] bg-white border border-gray-100 py-0.5 rounded hover:bg-orange-50 font-black text-gray-400 hover:text-orange-600 transition-colors">PDF</button>
                                                                <button onClick={() => handleSmartSearch(p, idx, 'folder')} className="flex-1 text-[7px] bg-white border border-gray-100 py-0.5 rounded hover:bg-green-50 font-black text-gray-400 hover:text-green-600 transition-colors">DRIVE</button>
                                                            </div>
                                                            <div className="flex gap-0.5 w-full">
                                                                <button onClick={() => handleSmartSearch(p, idx, 'web')} className="flex-1 text-[7px] bg-white border border-gray-100 py-0.5 rounded hover:bg-slate-100 font-black text-gray-400 hover:text-slate-900 transition-colors">WEB</button>
                                                                <button onClick={() => handleSmartSearch(p, idx, 'google_shopping')} className="flex-1 text-[7px] bg-white border border-gray-100 py-0.5 rounded hover:bg-purple-50 font-black text-gray-400 hover:text-purple-600 transition-colors">SHOP</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="flex flex-col gap-1 relative">
                                                        <div className="flex items-center gap-2 group/input">
                                                            <textarea
                                                                rows={2}
                                                                value={p.title || ""}
                                                                onChange={(e) => {
                                                                    const newProducts = [...products];
                                                                    newProducts[idx] = { ...p, title: e.target.value };
                                                                    setProducts(newProducts);
                                                                }}
                                                                onFocus={() => setActivePicker({ type: 'text', row: idx, field: 'title' })}
                                                                placeholder="Titolo..."
                                                                className="bg-transparent font-bold text-[#111827] border-b border-transparent hover:border-gray-100 focus:border-orange-400 focus:outline-none text-[12px] w-full resize-none break-words whitespace-pre-wrap leading-tight transition-all"
                                                            />
                                                            <button
                                                                onMouseEnter={() => setActivePicker({ type: 'text', row: idx, field: 'title' })}
                                                                className="p-1 hover:bg-orange-50 rounded transition-all text-orange-400"
                                                            >
                                                                <List className="w-3.5 h-3.5" />
                                                            </button>

                                                            <AnimatePresence>
                                                                {activePicker?.type === 'text' && activePicker.row === idx && activePicker.field === 'title' && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        onMouseLeave={() => {
                                                                            setActivePicker(null);
                                                                            setPickerSearch("");
                                                                        }}
                                                                        className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-2xl z-[60] p-3"
                                                                    >
                                                                        <div className="flex gap-1 mb-3 p-1 bg-gray-50 rounded-lg border border-gray-100">
                                                                            <button onClick={() => setPickerSourceMode('pdf')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'pdf' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400'}`}>PDF</button>
                                                                            <button onClick={() => setPickerSourceMode('file')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400'}`}>FILE</button>
                                                                            <button onClick={() => setPickerSourceMode('web')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'web' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400'}`}>WEB</button>
                                                                        </div>

                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                                                {pickerSourceMode === 'pdf' ? 'Testi estratti' : pickerSourceMode === 'file' ? 'Dati Listino' : 'Suggerimenti Web'}
                                                                            </p>
                                                                            <div className="relative">
                                                                                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    placeholder="Cerca..."
                                                                                    value={pickerSearch}
                                                                                    onChange={(e) => setPickerSearch(e.target.value)}
                                                                                    className="bg-gray-50 border-none rounded-md pl-6 pr-2 py-1 text-[10px] w-32 focus:ring-1 focus:ring-orange-200"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                                                            {pickerSourceMode === 'pdf' && pdfPages.flatMap((page: PageData, pIdx: number) => page.textBlocks
                                                                                .filter((b: TextBlock) => b.str.toLowerCase().includes(pickerSearch.toLowerCase()))
                                                                                .map((block: TextBlock, bIdx: number) => (
                                                                                    <div
                                                                                        key={`pdf-${pIdx}-${bIdx}`}
                                                                                        onClick={() => {
                                                                                            const newProducts = [...products];
                                                                                            newProducts[idx] = { ...p, title: block.str };
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                            setPickerSearch("");
                                                                                        }}
                                                                                        className="p-2 hover:bg-orange-50 rounded-lg cursor-pointer transition-all border border-transparent hover:border-orange-200"
                                                                                    >
                                                                                        <p className="text-[10px] text-gray-600 line-clamp-2 leading-relaxed">{block.str}</p>
                                                                                    </div>
                                                                                )))}

                                                                            {pickerSourceMode === 'file' && csvMasterList
                                                                                .filter(item => String(item[csvMapping.sku] || "").toLowerCase() === p.sku.toLowerCase())
                                                                                .map((item, fIdx) => (
                                                                                    <div
                                                                                        key={`file-${fIdx}`}
                                                                                        onClick={() => {
                                                                                            if (!activePicker) return;
                                                                                            const val = (item as any)[csvMapping[activePicker.field]];
                                                                                            if (val) {
                                                                                                const newProducts = [...products];
                                                                                                (newProducts[idx] as any)[activePicker.field] = String(val);
                                                                                                setProducts(newProducts);
                                                                                            }
                                                                                            setActivePicker(null);
                                                                                        }}
                                                                                        className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                                                                                    >
                                                                                        <p className="text-[10px] font-bold text-slate-900 mb-1">Valore nel file per SKU {p.sku}</p>
                                                                                        <p className="text-xs font-black text-slate-900">{activePicker ? String((item as any)[csvMapping[activePicker.field]] || "N/A") : "N/A"}</p>
                                                                                    </div>
                                                                                ))}

                                                                            {pickerSourceMode === 'web' && activePicker && (
                                                                                <div className="p-4 text-center space-y-3">
                                                                                    <Globe className="w-8 h-8 text-purple-200 mx-auto" />
                                                                                    <p className="text-[10px] text-gray-400 font-bold">Cerca "{p.sku}" sul web per {activePicker.field}</p>
                                                                                    <button
                                                                                        onClick={() => window.open(`https://www.google.com/search?q=${p.sku}+${activePicker.field}`, '_blank')}
                                                                                        className="w-full py-2 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-bold hover:bg-purple-100 transition-all"
                                                                                    >
                                                                                        Apri in Google Search
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                        {!activeMappedFields.includes('category') && (
                                                            <span className="text-[10px] text-gray-400 uppercase font-bold">{p.category || "Generale"}</span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col gap-2 relative">
                                                        <div className="flex items-center gap-2 group/input">
                                                            <input
                                                                type="text"
                                                                value={p.docDescription || ""}
                                                                onChange={(e) => {
                                                                    const newProducts = [...products];
                                                                    newProducts[idx] = { ...p, docDescription: e.target.value };
                                                                    setProducts(newProducts);
                                                                }}
                                                                onFocus={() => setActivePicker({ type: 'text', row: idx, field: 'docDescription' })}
                                                                placeholder="Descrizione..."
                                                                className="bg-transparent text-gray-600 border-b border-dashed border-gray-200 focus:border-orange-400 focus:outline-none text-xs w-full overflow-hidden text-ellipsis whitespace-nowrap"
                                                            />
                                                            <button
                                                                onMouseEnter={() => setActivePicker({ type: 'text', row: idx, field: 'docDescription' })}
                                                                className="p-1 hover:bg-orange-50 rounded transition-all text-orange-400"
                                                            >
                                                                <List className="w-3.5 h-3.5" />
                                                            </button>

                                                            <AnimatePresence>
                                                                {activePicker?.type === 'text' && activePicker.row === idx && activePicker.field === 'docDescription' && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        onMouseLeave={() => {
                                                                            setActivePicker(null);
                                                                            setPickerSearch("");
                                                                        }}
                                                                        className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-2xl z-[60] p-3"
                                                                    >
                                                                        <div className="flex gap-1 mb-3 p-1 bg-gray-50 rounded-lg border border-gray-100">
                                                                            <button onClick={() => setPickerSourceMode('pdf')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'pdf' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400'}`}>PDF</button>
                                                                            <button onClick={() => setPickerSourceMode('file')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400'}`}>FILE</button>
                                                                            <button onClick={() => setPickerSourceMode('web')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'web' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400'}`}>WEB</button>
                                                                        </div>

                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                                                {pickerSourceMode === 'pdf' ? 'Testi estratti' : pickerSourceMode === 'file' ? 'Dati Listino' : 'Suggerimenti Web'}
                                                                            </p>
                                                                            <div className="relative">
                                                                                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    placeholder="Cerca..."
                                                                                    value={pickerSearch}
                                                                                    onChange={(e) => setPickerSearch(e.target.value)}
                                                                                    className="bg-gray-50 border-none rounded-md pl-6 pr-2 py-1 text-[10px] w-32 focus:ring-1 focus:ring-orange-200"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                                                            {pickerSourceMode === 'pdf' && pdfPages.flatMap((page: PageData, pIdx: number) => page.textBlocks
                                                                                .filter((b: TextBlock) => b.str.toLowerCase().includes(pickerSearch.toLowerCase()))
                                                                                .map((block: TextBlock, bIdx: number) => (
                                                                                    <div
                                                                                        key={`pdf-${pIdx}-${bIdx}`}
                                                                                        onClick={() => {
                                                                                            const newProducts = [...products];
                                                                                            newProducts[idx] = { ...p, docDescription: block.str };
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                            setPickerSearch("");
                                                                                        }}
                                                                                        className="p-2 hover:bg-orange-50 rounded-lg cursor-pointer transition-all border border-transparent hover:border-orange-200"
                                                                                    >
                                                                                        <p className="text-[10px] text-gray-600 line-clamp-2 leading-relaxed">{block.str}</p>
                                                                                    </div>
                                                                                )))}

                                                                            {pickerSourceMode === 'file' && (() => {
                                                                                const filtered = (csvMasterList || []).filter(item => {
                                                                                    const itemSku = String(item[csvMapping.sku] || "").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                                                                                    const productSku = String(p.sku || "").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

                                                                                    if (pickerSearch) {
                                                                                        const search = pickerSearch.toLowerCase();
                                                                                        return Object.values(csvMapping).some(h =>
                                                                                            String(item[h] || "").toLowerCase().includes(search)
                                                                                        );
                                                                                    }
                                                                                    // If no search, show direct matches
                                                                                    return itemSku === productSku && productSku !== "";
                                                                                });

                                                                                if (!csvMasterList || csvMasterList.length === 0) {
                                                                                    return (
                                                                                        <div className="p-4 text-center border border-dashed border-red-100 rounded-xl bg-red-50/30">
                                                                                            <p className="text-[10px] text-red-400 font-bold">Nessun listino caricato.</p>
                                                                                            <p className="text-[8px] text-red-300">Carica un file Excel/CSV prima.</p>
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                if (filtered.length === 0) {
                                                                                    return (
                                                                                        <div className="p-6 text-center space-y-2 border-2 border-dashed border-gray-50 rounded-2xl">
                                                                                            <Search className="w-5 h-5 text-gray-200 mx-auto" />
                                                                                            <p className="text-[10px] text-gray-400 font-bold leading-tight">
                                                                                                Nessun dato trovato per "{p.sku}"<br />
                                                                                                nel listino ({csvMasterList?.length} righe).
                                                                                            </p>
                                                                                            <p className="text-[8px] text-gray-300">Usa la ricerca sopra per trovare il dato manualmente</p>
                                                                                        </div>
                                                                                    );
                                                                                }

                                                                                return filtered.slice(0, 5).map((item, fIdx) => (
                                                                                    <div
                                                                                        key={`file-${fIdx}`}
                                                                                        onClick={() => {
                                                                                            const val = item[csvMapping[activePicker.field]];
                                                                                            const newProducts = [...products];
                                                                                            (newProducts[idx] as any)[activePicker.field] = String(val || "");
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                            setPickerSearch("");
                                                                                        }}
                                                                                        className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all cursor-pointer group"
                                                                                    >
                                                                                        <div className="flex justify-between items-start mb-1">
                                                                                            <p className="text-[9px] font-bold text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">
                                                                                                {String(item[csvMapping.sku] || "N/A")}
                                                                                            </p>
                                                                                            <span className="text-[8px] bg-slate-300 text-slate-800 px-1.5 py-0.5 rounded uppercase font-black">Match Listino</span>
                                                                                        </div>
                                                                                        <p className="text-xs font-black text-slate-900 line-clamp-2">
                                                                                            {String(item[csvMapping[activePicker.field]] || "Valore vuoto")}
                                                                                        </p>
                                                                                    </div>
                                                                                ));
                                                                            })()}

                                                                            {pickerSourceMode === 'web' && (
                                                                                <div className="p-4 text-center space-y-3">
                                                                                    <Globe className="w-8 h-8 text-purple-200 mx-auto" />
                                                                                    <p className="text-[10px] text-gray-400 font-bold">Cerca "{p.sku}" sul web per {activePicker.field}</p>
                                                                                    <button
                                                                                        onClick={() => window.open(`https://www.google.com/search?q=${p.sku}+${activePicker.field}`, '_blank')}
                                                                                        className="w-full py-2 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-bold hover:bg-purple-100 transition-all"
                                                                                    >
                                                                                        Apri in Google Search
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>
                                                </td>
                                                {allDynamicColumns.map(col => (
                                                    <td key={col.key} className="px-8 py-6">
                                                        <div className="relative flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={col.isSystem ? (p as any)[col.key] || "" : p.extraFields?.[col.key] || ""}
                                                                onChange={(e) => {
                                                                    const newProducts = [...products];
                                                                    if (col.isSystem) {
                                                                        newProducts[idx] = { ...p, [col.key]: e.target.value };
                                                                    } else {
                                                                        newProducts[idx] = {
                                                                            ...p,
                                                                            extraFields: { ...p.extraFields, [col.key]: e.target.value }
                                                                        };
                                                                    }
                                                                    setProducts(newProducts);
                                                                }}
                                                                onFocus={() => setActivePicker({ type: 'text', row: idx, field: col.key })}
                                                                className="bg-transparent border-b border-dashed border-gray-200 focus:border-orange-400 focus:outline-none text-sm text-gray-600 w-full"
                                                            />
                                                            <button
                                                                onMouseEnter={() => setActivePicker({ type: 'text', row: idx, field: col.key })}
                                                                className="p-1 hover:bg-orange-50 rounded transition-all text-orange-400"
                                                            >
                                                                <List className="w-3.5 h-3.5" />
                                                            </button>

                                                            <AnimatePresence>
                                                                {activePicker?.type === 'text' && activePicker.row === idx && activePicker.field === col.key && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        onMouseLeave={() => {
                                                                            setActivePicker(null);
                                                                            setPickerSearch("");
                                                                        }}
                                                                        className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-2xl z-[60] p-3"
                                                                    >
                                                                        <div className="flex gap-1 mb-3 p-1 bg-gray-50 rounded-lg border border-gray-100">
                                                                            <button onClick={() => setPickerSourceMode('pdf')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'pdf' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400'}`}>PDF</button>
                                                                            <button onClick={() => setPickerSourceMode('file')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400'}`}>FILE</button>
                                                                            <button onClick={() => setPickerSourceMode('web')} className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'web' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400'}`}>WEB</button>
                                                                        </div>

                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                                                {pickerSourceMode === 'pdf' ? 'Testi estratti' : pickerSourceMode === 'file' ? 'Dati Listino' : 'Suggerimenti Web'}
                                                                            </p>
                                                                            <div className="relative">
                                                                                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                                                                <input
                                                                                    autoFocus
                                                                                    type="text"
                                                                                    placeholder="Cerca..."
                                                                                    value={pickerSearch}
                                                                                    onChange={(e) => setPickerSearch(e.target.value)}
                                                                                    className="bg-gray-50 border-none rounded-md pl-6 pr-2 py-1 text-[10px] w-32 focus:ring-1 focus:ring-orange-200"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                                                            {pickerSourceMode === 'pdf' && pdfPages.flatMap((page: PageData, pIdx: number) => page.textBlocks
                                                                                .filter((b: TextBlock) => b.str.toLowerCase().includes(pickerSearch.toLowerCase()))
                                                                                .map((block: TextBlock, bIdx: number) => (
                                                                                    <div
                                                                                        key={`pdf-${pIdx}-${bIdx}`}
                                                                                        onClick={() => {
                                                                                            const newProducts = [...products];
                                                                                            if (col.isSystem) {
                                                                                                newProducts[idx] = { ...p, [col.key]: block.str };
                                                                                            } else {
                                                                                                newProducts[idx] = {
                                                                                                    ...p,
                                                                                                    extraFields: { ...p.extraFields, [col.key]: block.str }
                                                                                                };
                                                                                            }
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                            setPickerSearch("");
                                                                                        }}
                                                                                        className="p-2 hover:bg-orange-50 rounded-lg cursor-pointer transition-all border border-transparent hover:border-orange-200"
                                                                                    >
                                                                                        <p className="text-[10px] text-gray-600 line-clamp-2 leading-relaxed">{block.str}</p>
                                                                                    </div>
                                                                                )))}

                                                                            {pickerSourceMode === 'file' && csvMasterList
                                                                                .filter(item => String(item[csvMapping.sku] || "").toLowerCase() === p.sku.toLowerCase())
                                                                                .map((item, fIdx) => (
                                                                                    <div
                                                                                        key={`file-${fIdx}`}
                                                                                        onClick={() => {
                                                                                            if (!activePicker) return;
                                                                                            const val = (item as any)[csvMapping[col.key]];
                                                                                            if (val) {
                                                                                                const newProducts = [...products];
                                                                                                if (col.isSystem) {
                                                                                                    (newProducts[idx] as any)[col.key] = String(val);
                                                                                                } else {
                                                                                                    newProducts[idx] = {
                                                                                                        ...p,
                                                                                                        extraFields: { ...p.extraFields, [col.key]: String(val) }
                                                                                                    };
                                                                                                }
                                                                                                setProducts(newProducts);
                                                                                            }
                                                                                            setActivePicker(null);
                                                                                        }}
                                                                                        className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all cursor-pointer"
                                                                                    >
                                                                                        <p className="text-[10px] font-bold text-slate-900 mb-1">Valore nel file per SKU {p.sku}</p>
                                                                                        <p className="text-xs font-black text-slate-900">{activePicker ? String((item as any)[csvMapping[col.key]] || "N/A") : "N/A"}</p>
                                                                                    </div>
                                                                                ))}

                                                                            {pickerSourceMode === 'web' && activePicker && (
                                                                                <div className="p-4 text-center space-y-3">
                                                                                    <Globe className="w-8 h-8 text-purple-200 mx-auto" />
                                                                                    <p className="text-[10px] text-gray-400 font-bold">Cerca "{p.sku}" sul web per {col.label}</p>
                                                                                    <button
                                                                                        onClick={() => window.open(`https://www.google.com/search?q=${p.sku}+${col.label}`, '_blank')}
                                                                                        className="w-full py-2 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-bold hover:bg-purple-100 transition-all"
                                                                                    >
                                                                                        Apri in Google Search
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </td>
                                                ))}
                                                {[0, 1, 2, 3].map((slot) => (
                                                    <td key={slot} className="px-4 py-6">
                                                        <div className="relative group/slot z-10 hover:z-[70]">
                                                            <div
                                                                onMouseEnter={() => {
                                                                    setActivePicker({ type: 'image', row: idx, field: `slot-${slot}` });
                                                                    setPickerSearchQuery(p.sku);
                                                                    if (p.images[slot]) setPreviewImage(resolveImageUrl(p.images[slot].url));
                                                                }}
                                                                onMouseLeave={() => setPreviewImage(null)}
                                                                className="w-16 h-16 rounded-xl border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center hover:border-orange-300 transition-all cursor-pointer group-hover/slot:scale-[2.5] group-hover/slot:shadow-2xl group-hover/slot:border-orange-400 group-hover/slot:rotate-2"
                                                            >
                                                                {p.images[slot] ? (
                                                                    <img src={resolveImageUrl(p.images[slot].url)} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <ImageIcon className="w-5 h-5 text-gray-300" />
                                                                )}
                                                            </div>

                                                            {activePicker?.type === 'image' && activePicker.row === idx && activePicker.field === `slot-${slot}` && (
                                                                <div
                                                                    onMouseLeave={() => setActivePicker(null)}
                                                                    className={`absolute ${idx < 3 ? 'top-full mt-4' : 'bottom-full mb-4'} ${slot === 2 ? 'right-0' : 'left-0'} w-80 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in duration-200`}
                                                                >
                                                                    <div className="flex items-center justify-between mb-4 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                                                        <button
                                                                            onClick={() => {
                                                                                const input = document.createElement('input');
                                                                                input.type = 'file';
                                                                                input.accept = 'image/*';
                                                                                input.onchange = async (e: any) => {
                                                                                    const file = e.target.files[0];
                                                                                    if (file) {
                                                                                        const reader = new FileReader();
                                                                                        reader.onload = async (evt) => {
                                                                                            const dataUrl = evt.target?.result as string;
                                                                                            const localUrl = await saveImageToServer(dataUrl, p.sku);
                                                                                            const newProducts = [...products];
                                                                                            const newImages = [...p.images];
                                                                                            newImages[slot] = { id: Math.random().toString(), url: localUrl };
                                                                                            newProducts[idx] = { ...p, images: newImages.filter(Boolean) };
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                        };
                                                                                        reader.readAsDataURL(file);
                                                                                    }
                                                                                };
                                                                                input.click();
                                                                            }}
                                                                            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[9px] font-bold text-gray-400 hover:text-orange-600 hover:bg-white transition-all"
                                                                        >
                                                                            <FolderOpen className="w-3 h-3" />
                                                                            FILE
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setPickerSourceMode('pdf')}
                                                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'pdf' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                                        >
                                                                            <FileText className="w-3 h-3" />
                                                                            PDF
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setPickerSourceMode('web');
                                                                                setPickerSearchQuery(p.sku);
                                                                                if (webResults.length === 0) handleWebSearch(p, p.sku);
                                                                            }}
                                                                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[9px] font-bold transition-all ${pickerSourceMode === 'web' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}
                                                                        >
                                                                            <Globe className="w-3 h-3" />
                                                                            WEB
                                                                        </button>
                                                                    </div>

                                                                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto custom-scrollbar p-1">
                                                                        <div
                                                                            onClick={() => {
                                                                                const newProducts = [...products];
                                                                                const newImages = [...p.images];
                                                                                newImages[slot] = undefined as any;
                                                                                newProducts[idx] = { ...p, images: newImages.filter(Boolean) };
                                                                                setProducts(newProducts);
                                                                                setActivePicker(null);
                                                                            }}
                                                                            className="aspect-square rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center hover:border-red-200 cursor-pointer"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-red-300" />
                                                                        </div>

                                                                        {pickerSourceMode === 'pdf' ? (
                                                                            <>
                                                                                <div className="col-span-3 mb-2 flex flex-col gap-2 relative">
                                                                                    {isSearchingPdfAi && (
                                                                                        <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center rounded-xl backdrop-blur-sm">
                                                                                            <div className="w-5 h-5 border-2 border-orange-100 border-t-orange-500 rounded-full animate-[spin_0.5s_linear_infinite]" />
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-2 border border-gray-100 shadow-inner">
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setPickerPageIdx(prev => Math.max(0, prev - 1));
                                                                                                setPdfAiMatches(null);
                                                                                            }}
                                                                                            disabled={pickerPageIdx === 0}
                                                                                            className="p-1 px-2 hover:bg-white rounded-lg disabled:opacity-20 transition-all shadow-sm border border-transparent hover:border-gray-200"
                                                                                        >
                                                                                            <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                                                                                        </button>
                                                                                        <div className="flex flex-col items-center">
                                                                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em] mb-0.5">{pdfAiMatches ? 'AI MATCH' : 'Sorgente PDF'}</span>
                                                                                            <div className="text-[10px] font-black text-[#111827] uppercase tracking-wider text-center flex gap-1">
                                                                                                {pdfAiMatches ? `TOP ${pdfAiMatches.length} RISULTATI` : `Pagina ${pickerPageIdx + 1} `}
                                                                                                {!pdfAiMatches && <span className="text-gray-300">/ {pdfPages.length}</span>}
                                                                                            </div>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                setPickerPageIdx(prev => Math.min(pdfPages.length - 1, prev + 1));
                                                                                                setPdfAiMatches(null);
                                                                                            }}
                                                                                            disabled={pdfPages.length === 0 || pickerPageIdx === pdfPages.length - 1}
                                                                                            className="p-1 px-2 hover:bg-white rounded-lg disabled:opacity-20 transition-all shadow-sm border border-transparent hover:border-gray-200"
                                                                                        >
                                                                                            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                                                                                        </button>
                                                                                    </div>

                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); handlePdfAiMatch(p); }}
                                                                                        className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${pdfAiMatches ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-orange-500'}`}
                                                                                        title="Trova questa immagine in tutto il PDF tramite Intelligenza Artificiale visiva"
                                                                                    >
                                                                                        <Sparkles className="w-3 h-3" />
                                                                                        Ricerca Visiva AI (Tutto il PDF)
                                                                                    </button>
                                                                                </div>

                                                                                {pdfAiMatches ? (
                                                                                    pdfAiMatches.map((m: any, mIdx: number) => (
                                                                                        <div
                                                                                            key={`ai-${mIdx}`}
                                                                                            onMouseEnter={() => setPreviewImage(m.preview)}
                                                                                            onMouseLeave={() => setPreviewImage(null)}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const newProducts = [...products];
                                                                                                const newImages = [...p.images];
                                                                                                newImages[slot] = { id: Math.random().toString(), url: m.preview };
                                                                                                newProducts[idx] = { ...p, images: newImages.filter(Boolean) };
                                                                                                setProducts(newProducts);
                                                                                                extractHighResAsset(m.pageIdx, m.ref, idx, slot);
                                                                                                setActivePicker(null);
                                                                                                setPdfAiMatches(null);
                                                                                            }}
                                                                                            className="aspect-square rounded-lg border border-orange-200 overflow-hidden hover:border-orange-500 cursor-pointer transition-all bg-orange-50/30 hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative relative group"
                                                                                        >
                                                                                            <div className="absolute top-0 right-0 bg-black/70 text-[10px] px-1 py-0.5 rounded-bl-lg font-bold text-[#E6D3C1] z-10">P.{m.pageIdx + 1}</div>
                                                                                            <img src={m.preview} className="w-full h-full object-contain" />
                                                                                        </div>
                                                                                    ))
                                                                                ) : (
                                                                                    pdfPages[pickerPageIdx] && (
                                                                                        <>
                                                                                            <div className="col-span-3 grid grid-cols-3 gap-2">
                                                                                                {(pdfPages[pickerPageIdx].subImages || []).map((sImg: any, sIdx: number) => (
                                                                                                    <div
                                                                                                        key={`sub-${pickerPageIdx}-${sIdx}`}
                                                                                                        onMouseEnter={() => setPreviewImage(sImg.preview)}
                                                                                                        onMouseLeave={() => setPreviewImage(null)}
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newProducts = [...products];
                                                                                                            const newImages = [...p.images];
                                                                                                            newImages[slot] = { id: Math.random().toString(), url: sImg.preview };
                                                                                                            newProducts[idx] = { ...p, images: newImages.filter(Boolean) };
                                                                                                            setProducts(newProducts);
                                                                                                            extractHighResAsset(pickerPageIdx, sImg.ref, idx, slot);
                                                                                                            setActivePicker(null);
                                                                                                        }}
                                                                                                        className="aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-slate-400 cursor-pointer transition-all bg-slate-50/30 hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative"
                                                                                                    >
                                                                                                        <img src={sImg.preview} className="w-full h-full object-contain" />
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                            <div
                                                                                                onMouseEnter={() => setPreviewImage(pdfPages[pickerPageIdx].imageUrl)}
                                                                                                onMouseLeave={() => setPreviewImage(null)}
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    const newProducts = [...products];
                                                                                                    const newImages = [...p.images];
                                                                                                    newImages[slot] = { id: Math.random().toString(), url: `PAGE_REF_${pickerPageIdx + 1}` };
                                                                                                    newProducts[idx] = { ...p, images: newImages.filter(Boolean) };
                                                                                                    setProducts(newProducts);
                                                                                                    setActivePicker(null);
                                                                                                }}
                                                                                                className="aspect-square rounded-lg border border-gray-100 overflow-hidden hover:border-orange-400 cursor-pointer transition-all opacity-60 hover:opacity-100 hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative"
                                                                                            >
                                                                                                <img src={pdfPages[pickerPageIdx].imageUrl} className="w-full h-full object-cover" title={`Pagina ${pickerPageIdx + 1}`} />
                                                                                            </div>
                                                                                        </>
                                                                                    )
                                                                                )}
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className="col-span-3 pb-2 flex flex-col gap-3">
                                                                                    <div className="flex items-center justify-between px-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                                                        <label className="flex items-center gap-2 cursor-pointer w-full group">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={useGoogleShopping}
                                                                                                onChange={(e) => setUseGoogleShopping(e.target.checked)}
                                                                                                className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 transition-all"
                                                                                            />
                                                                                            <div className="flex flex-col">
                                                                                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest group-hover:text-orange-600 transition-colors">Google Shopping Integration</span>
                                                                                                <span className="text-[8px] font-bold text-gray-400">Ricerca avanzata prezzi e asset su SerpApi</span>
                                                                                            </div>
                                                                                        </label>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Search className="w-3 h-3 text-gray-400" />
                                                                                        <input
                                                                                            type="text"
                                                                                            value={pickerSearchQuery}
                                                                                            onChange={(e) => setPickerSearchQuery(e.target.value)}
                                                                                            onKeyDown={(e) => e.key === 'Enter' && handleWebSearch(p, pickerSearchQuery)}
                                                                                            placeholder="Cerca immagini..."
                                                                                            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold focus:outline-none focus:border-slate-400"
                                                                                        />
                                                                                        <button
                                                                                            onClick={() => handleWebSearch(p, pickerSearchQuery)}
                                                                                            className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-900"
                                                                                        >
                                                                                            <Search className="w-3 h-3" />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                                {isSearchingWeb ? (
                                                                                    <div className="col-span-3 py-8 flex flex-col items-center justify-center gap-2">
                                                                                        <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase">Ricerca in corso...</span>
                                                                                    </div>
                                                                                ) : (
                                                                                    webResults.map((result, rIdx) => (
                                                                                        <div
                                                                                            key={rIdx}
                                                                                            onMouseEnter={() => setPreviewImage(result.url)}
                                                                                            onMouseLeave={() => setPreviewImage(null)}
                                                                                            onClick={async (e) => {
                                                                                                e.stopPropagation();
                                                                                                const toastId = toast.loading("Salvataggio immagine sul server...");
                                                                                                try {
                                                                                                    const localUrl = await saveImageToServer(result.url, p.sku);
                                                                                                    const newProducts = [...products];
                                                                                                    const newImages = [...p.images];
                                                                                                    newImages[slot] = { id: Math.random().toString(), url: localUrl };

                                                                                                    let updatedProduct = { ...p, images: newImages.filter(Boolean) };
                                                                                                    if (result.productData) {
                                                                                                        let updatedSomething = false;
                                                                                                        if (result.productData.price && (!updatedProduct.price || updatedProduct.price.trim() === '€ 0.00')) {
                                                                                                            updatedProduct.price = result.productData.price;
                                                                                                            updatedSomething = true;
                                                                                                        }
                                                                                                        if (result.productData.description && !updatedProduct.description) {
                                                                                                            updatedProduct.description = result.productData.description;
                                                                                                            updatedSomething = true;
                                                                                                        }
                                                                                                        if (updatedSomething) toast.success("Dati aggiornati automaticamente da Shopping!");
                                                                                                    }

                                                                                                    newProducts[idx] = updatedProduct;
                                                                                                    setProducts(newProducts);
                                                                                                    toast.update(toastId, { render: "Immagine salvata!", type: "success", isLoading: false, autoClose: 2000 });
                                                                                                    setActivePicker(null);
                                                                                                } catch (err) {
                                                                                                    toast.update(toastId, { render: "Errore nel salvataggio locale", type: "error", isLoading: false, autoClose: 2000 });
                                                                                                }
                                                                                            }}
                                                                                            className="aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-slate-900 cursor-pointer transition-all hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative bg-white"
                                                                                        >
                                                                                            <img src={result.url} className="w-full h-full object-contain" />
                                                                                            {(result.productData || useGoogleShopping) && (
                                                                                                <div className="absolute top-0 right-0 bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-lg flex items-center gap-1">
                                                                                                    <ShoppingCart className="w-2.5 h-2.5" />
                                                                                                    SHOPPING
                                                                                                </div>
                                                                                            )}
                                                                                            {result.source && !result.productData && (
                                                                                                <div className="absolute top-0 right-0 bg-purple-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-lg">
                                                                                                    {result.source.substring(0, 10).toUpperCase()}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))
                                                                                )}
                                                                                {!isSearchingWeb && webResults.length === 0 && (
                                                                                    <div className="col-span-3 py-8 text-center">
                                                                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Nessun risultato</p>
                                                                                        <button
                                                                                            onClick={() => handleWebSearch(p)}
                                                                                            className="mt-2 text-[9px] text-slate-900 hover:underline font-bold"
                                                                                        >
                                                                                            Riprova
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                ))}
                                                <td className="px-8 py-6 text-right">
                                                    <input
                                                        type="text"
                                                        value={p.price || ""}
                                                        onChange={(e) => {
                                                            const newProducts = [...products];
                                                            newProducts[idx] = { ...p, price: e.target.value };
                                                            setProducts(newProducts);
                                                        }}
                                                        className="bg-transparent text-right font-bold text-gray-900 border-b border-dashed border-gray-200 focus:border-orange-400 focus:outline-none w-24"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                        {products.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-8 py-20 text-center opacity-20">
                                                    <LayoutGrid className="w-20 h-20 mx-auto mb-4" />
                                                    <p className="text-sm font-bold uppercase tracking-widest">Nessun record in cache</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {products.length > displayLimit && (
                                <div className="p-8 flex justify-center bg-gray-50/10 border-t border-gray-100">
                                    <button
                                        onClick={() => setDisplayLimit(prev => prev + 30)}
                                        className="bg-white border border-gray-200 text-gray-600 px-12 py-3 rounded-xl font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center gap-2 hover:bg-gray-50"
                                    >
                                        <ChevronRight className="w-4 h-4 rotate-90" />
                                        Carica altri 30 records ({products.length - displayLimit} rimanenti)
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : currentView === 'asset-matcher' ? (
                    <motion.div
                        key="asset-matcher"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-10"
                    >
                        {/* Asset Matcher Header Card */}
                        <div className="main-card p-10 bg-gradient-to-br from-slate-50/50 to-white">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                                <div className="flex items-center gap-6">
                                    <div className="p-5 bg-slate-900 rounded-[2rem] shadow-lg shadow-slate-200">
                                        <HardDrive className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-4">
                                            <input
                                                value={projectName}
                                                onChange={(e) => setProjectName(e.target.value)}
                                                className="bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-slate-900 text-xl font-bold text-gray-800 outline-none px-2 py-1 transition-all"
                                                placeholder="Nome Progetto..."
                                            />
                                            <button
                                                onClick={() => {
                                                    if (confirm("Sei sicuro di voler avviare un nuovo progetto? Tutti i dati in memoria verranno puliti.")) {
                                                        setProducts([]);
                                                        setPdfPages([]);
                                                        setCurrentPdfUrl(null);
                                                        setCsvMasterList([]);
                                                        setCsvHeaders([]);
                                                        setExtraColumns([]);
                                                        setProjectName("Nuovo Progetto");
                                                        toast.success("Nuovo progetto avviato");
                                                    }
                                                }}
                                                className="px-4 py-1.5 text-xs font-black uppercase tracking-widest text-slate-400 bg-slate-900 hover:bg-black rounded-lg transition-all"
                                            >
                                                Nuovo Progetto
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Automatic matching Master List ↔ Asset Folder</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => csvInputRef.current?.click()}
                                        className="btn-secondary flex items-center gap-3"
                                    >
                                        <Upload className="w-5 h-5 text-slate-900" />
                                        {csvMasterList.length > 0 ? "Cambia Listino" : "Carica Listino (Excel/CSV)"}
                                    </button>
                                    <button
                                        onClick={bulkMatchSkuAssets}
                                        disabled={isMatchingAssets || products.length === 0}
                                        className={`px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg ${isMatchingAssets || products.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#111827] text-white hover:bg-black shadow-slate-900/10'}`}
                                    >
                                        {isMatchingAssets ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                        Avvia Associazione Bulk
                                    </button>
                                    <button
                                        onClick={saveAllToERP}
                                        disabled={isMatchingAssets || products.length === 0}
                                        className={`px-8 py-3.5 rounded-xl font-bold text-sm flex items-center gap-3 transition-all shadow-lg ${isMatchingAssets || products.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#111827] text-white hover:bg-black shadow-slate-900/10'}`}
                                    >
                                        <Database className="w-5 h-5" />
                                        Sincronizza TUTTO su ERP
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 pt-12 border-t border-gray-100">
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-[#111827] ml-1">Percorso Base Asset</label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            value={assetBaseUrl}
                                            onChange={(e) => setAssetBaseUrl(e.target.value)}
                                            placeholder="https://mio-sito.it/foto/ o /public/assets/"
                                            className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-slate-300 rounded-2xl text-sm font-bold transition-all outline-none"
                                        />
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-bold px-1 italic">
                                        Tip: L&apos;asset verrà cercato come: <span className="text-[#111827]">{assetBaseUrl || '[URL BASE]'}SKU{assetExtension}</span>
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-[#111827] ml-1">Estensione File</label>
                                    <div className="flex items-center gap-3">
                                        {[".jpg", ".png", ".webp", ".pdf"].map((ext: string) => (
                                            <button
                                                key={ext}
                                                onClick={() => setAssetExtension(ext)}
                                                className={`flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${assetExtension === ext ? 'bg-[#111827] border-[#111827] text-white shadow-lg' : 'bg-white border-gray-100 text-gray-400 hover:border-slate-300'}`}
                                            >
                                                {ext}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Listino / Workspace Table */}
                        <div className="main-card">
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-gray-50 rounded-xl">
                                        <Database className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-black text-[#111827]">Workspace Records ({products.length})</h3>
                                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-widest">Premium v3.5 Alpha</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={exportToExcel}
                                        className="btn-secondary flex items-center gap-3 py-2.5"
                                    >
                                        <FileDown className="w-4 h-4" />
                                        Esporta Risultati
                                    </button>
                                    <div className="relative ml-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={wsSearchTerm}
                                            onChange={(e) => setWsSearchTerm(e.target.value)}
                                            placeholder="Cerca record..."
                                            className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold focus:bg-white focus:border-slate-400 focus:outline-none transition-all w-64 shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            <th className="px-8 py-5">SKU</th>
                                            <th className="px-8 py-5">Stato Asset</th>
                                            <th className="px-8 py-5" colSpan={4}>Asset Immagini (Miniature)</th>
                                            {/* Dynamic User Mapped Columns */}
                                            {Object.entries(csvMapping).map(([field, header]) => {
                                                if (!header || !field || typeof field !== 'string' || field.startsWith('image')) return null;
                                                const label = field.replace(/([A-Z])/g, ' $1').trim().charAt(0).toUpperCase() + field.replace(/([A-Z])/g, ' $1').trim().slice(1);
                                                return <th key={field} className="px-8 py-5">{label}</th>;
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {products
                                            .filter((p: ProductData) => {
                                                const search = wsSearchTerm.toLowerCase();
                                                return p.sku.toLowerCase().includes(search) ||
                                                    (p.title && p.title.toLowerCase().includes(search)) ||
                                                    (p.category && p.category.toLowerCase().includes(search));
                                            })
                                            .slice(0, displayLimit).map((p: ProductData, idx: number) => {
                                                const assetUrl = resolveAssetUrl(assetBaseUrl, p.sku, assetExtension);
                                                const isMatched = p.images.some((img: ProductImage) => img.url === assetUrl);

                                                return (
                                                    <tr key={idx} className="hover:bg-slate-50/20 transition-colors">
                                                        <td className="px-8 py-6">
                                                            <div className="flex flex-col items-start gap-2">
                                                                <span className="font-mono font-bold text-sm bg-gray-900 text-orange-200 px-3 py-1.5 rounded-lg whitespace-nowrap">{p.sku}</span>
                                                                <button
                                                                    onClick={() => handleAutoFillData(p, idx)}
                                                                    className="text-[9px] font-black uppercase tracking-wider text-white flex items-center gap-1.5 transition-all whitespace-nowrap bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 px-3 py-1.5 rounded-lg shadow-[0_4px_12px_rgba(79,70,229,0.25)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 group/btn"
                                                                    title="Cerca dati mancanti su Web (Google Shopping & Scraping)"
                                                                >
                                                                    <Sparkles className="w-3.5 h-3.5 text-indigo-200 group-hover/btn:rotate-12 transition-transform" />
                                                                    <span className="drop-shadow-sm">Auto-Compila</span>
                                                                </button>
                                                                <div className="flex flex-col gap-1 w-full mt-1">
                                                                    <div className="flex gap-1 w-full">
                                                                        <button onClick={() => handleSmartSearch(p, idx, 'pdf')} className="flex-1 text-[8px] bg-orange-50 text-orange-600 border border-orange-100 py-1.5 rounded hover:bg-orange-100 font-bold tracking-wider transition-all hover:shadow-sm" title="Search in CURRENT PDF">PDF</button>
                                                                        <button onClick={() => handleGlobalDeepSearch(p.sku)} className="flex-1 text-[8px] bg-indigo-50 text-indigo-600 border border-indigo-100 py-1.5 rounded hover:bg-indigo-100 font-black tracking-widest transition-all hover:shadow-sm uppercase" title="Search in ALL CATALOGS (Historical)">Deep</button>
                                                                        <button onClick={() => handleSmartSearch(p, idx, 'folder')} className="flex-1 text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 py-1.5 rounded hover:bg-emerald-100 font-bold tracking-wider transition-all hover:shadow-sm">DRIVE</button>
                                                                    </div>
                                                                    <div className="flex gap-1 w-full">
                                                                        <button onClick={() => handleSmartSearch(p, idx, 'web')} className="flex-1 text-[8px] bg-slate-50 text-slate-800 border border-slate-200 py-1.5 rounded hover:bg-slate-200 font-bold tracking-wider transition-all hover:shadow-sm">WEB</button>
                                                                        <button onClick={() => handleSmartSearch(p, idx, 'google_shopping')} className="flex-1 text-[8px] bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100 py-1.5 rounded hover:bg-fuchsia-100 font-bold tracking-wider transition-all hover:shadow-sm uppercase">Shop</button>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleGenerateAIDescription(idx, p)}
                                                                        disabled={isGeneratingAI === idx}
                                                                        className="w-full text-[8px] mt-1 bg-white text-indigo-600 border border-indigo-200 py-1.5 rounded hover:bg-indigo-50 font-black tracking-widest flex justify-center items-center gap-1.5 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                                                                    >
                                                                        {isGeneratingAI === idx ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5 text-indigo-400" />}
                                                                        GENERA SEO AI
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <div className="flex flex-col gap-2">
                                                                {isMatched ? (
                                                                    <div className="flex items-center gap-2.5 group/status">
                                                                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-200">
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Completo</span>
                                                                            <span className="text-[8px] font-bold text-emerald-400">Asset Drive OK</span>
                                                                        </div>
                                                                    </div>
                                                                ) : p.images.some(img => img.url.startsWith("PAGE_REF_")) ? (
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shadow-sm border border-orange-200">
                                                                            <FileText className="w-4 h-4" />
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">Riferimento PDF</span>
                                                                            <span className="text-[8px] font-bold text-orange-400">Pagina estratta</span>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-2.5 opacity-60">
                                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shadow-sm border border-slate-200">
                                                                            <X className="w-4 h-4" />
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mancante</span>
                                                                            <span className="text-[8px] font-bold text-slate-300">Nessun asset</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {p.images.length > 0 && !isMatched && !p.images.every(img => img.url.startsWith("PAGE_REF_")) && (
                                                                    <div className="mt-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-100 w-fit">
                                                                        <span className="text-[7px] font-black text-red-400 uppercase tracking-tighter">Errore Link Foto</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        {[0, 1, 2, 3].map((slot) => {
                                                            const imgObj = p.images[slot];
                                                            const isPageRef = imgObj?.url.startsWith("PAGE_REF_");
                                                            const resolvedUrl = imgObj ? resolveImageUrl(imgObj.url) : null;

                                                            return (
                                                                <td key={slot} className="px-2 py-6">
                                                                    <div className="relative group/slot z-10 hover:z-[70]">
                                                                        <div
                                                                            onClick={() => {
                                                                                setActivePicker({ type: 'image', row: idx, field: `slot-${slot}` });
                                                                                setPickerSearchQuery(p.sku);
                                                                            }}
                                                                            onMouseEnter={() => {
                                                                                if (resolvedUrl) setPreviewImage(resolvedUrl);
                                                                            }}
                                                                            onMouseLeave={() => setPreviewImage(null)}
                                                                            className={`w-14 h-14 rounded-xl border overflow-hidden flex items-center justify-center transition-all cursor-pointer group-hover/slot:scale-[2.5] group-hover/slot:shadow-2xl group-hover/slot:rotate-2 relative ${isPageRef
                                                                                ? 'border-orange-100 bg-orange-50/30'
                                                                                : resolvedUrl
                                                                                    ? 'border-gray-100 bg-gray-50'
                                                                                    : 'border-gray-50 bg-gray-50/50'
                                                                                } ${resolvedUrl ? 'hover:border-orange-400' : 'hover:border-gray-200'}`}
                                                                        >
                                                                            {resolvedUrl ? (
                                                                                <div className="relative w-full h-full">
                                                                                    <img
                                                                                        src={resolvedUrl}
                                                                                        alt={`Product slice ${slot + 1}`}
                                                                                        className="w-full h-full object-contain transition-all duration-300 group-hover/slot:scale-110"
                                                                                        onError={(e) => {
                                                                                            e.currentTarget.style.display = 'none';
                                                                                            const parent = e.currentTarget.parentElement;
                                                                                            if (parent) {
                                                                                                const placeholder = document.createElement('div');
                                                                                                placeholder.className = "flex flex-col items-center justify-center h-full w-full bg-gray-50/50 text-gray-300 gap-1";
                                                                                                placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-off h-4 w-4"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.82-2.82"/><line x1="10" x2="21" y1="15" y2="15"/><path d="m21 11.546-5.835-5.835a.5.5 0 0 0-.71 0L12 8.168"/><path d="M18 10.148V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h11.411"/></svg><span class="text-[6px] font-black font-mono">BROKEN URL</span>';
                                                                                                parent.appendChild(placeholder);
                                                                                            }
                                                                                        }}
                                                                                    />
                                                                                    {isPageRef ? (
                                                                                        <div className="absolute top-1 left-1 bg-orange-500/90 backdrop-blur-sm text-white text-[7px] font-black px-1.5 py-0.5 rounded shadow-sm border border-orange-400/50 uppercase tracking-widest z-20">PDF</div>
                                                                                    ) : (
                                                                                        <div className="absolute top-1 left-1 bg-emerald-500/90 backdrop-blur-sm text-white text-[7px] font-black px-1.5 py-0.5 rounded shadow-sm border border-emerald-400/50 uppercase tracking-widest z-20">Drive</div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex flex-col items-center justify-center gap-1 opacity-20 group-hover/slot:opacity-60 transition-all duration-300 grayscale group-hover/slot:grayscale-0">
                                                                                    <ImageIcon className="w-4 h-4 text-gray-400 group-hover/slot:text-orange-400" />
                                                                                    <span className="text-[7px] font-mono font-black uppercase tracking-tighter text-gray-400 group-hover/slot:text-gray-600">Vuoto {slot + 1}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {activePicker?.type === 'image' && activePicker.row === idx && activePicker.field === `slot-${slot}` && (
                                                                            <div
                                                                                onMouseLeave={() => setActivePicker(null)}
                                                                                className={`absolute ${idx < 5 ? 'top-full mt-4' : 'bottom-full mb-4'} left-0 w-80 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in duration-200`}
                                                                            >
                                                                                <div className="flex items-center justify-between mb-4 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                                                                    <button
                                                                                        onClick={() => setPickerSourceMode('pdf')}
                                                                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${pickerSourceMode === 'pdf' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    >
                                                                                        <FileText className="w-3 h-3" />
                                                                                        PDF Source
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setPickerSourceMode('web');
                                                                                            setPickerSearchQuery(p.sku);
                                                                                            if (webResults.length === 0) handleWebSearch(p, p.sku);
                                                                                        }}
                                                                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${pickerSourceMode === 'web' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    >
                                                                                        <Globe className="w-3 h-3" />
                                                                                        WEB
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => setPickerSourceMode('folder')}
                                                                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${pickerSourceMode === 'folder' ? 'bg-white shadow-sm text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    >
                                                                                        <FolderOpen className="w-3 h-3" />
                                                                                        Folder
                                                                                    </button>
                                                                                </div>

                                                                                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto custom-scrollbar p-1">
                                                                                    <div
                                                                                        onClick={() => {
                                                                                            const newProducts = [...products];
                                                                                            const newImages = [...p.images];
                                                                                            newImages[slot] = undefined as any;
                                                                                            newProducts[idx] = { ...p, images: newImages.filter(Boolean) as ProductImage[] };
                                                                                            setProducts(newProducts);
                                                                                            setActivePicker(null);
                                                                                        }}
                                                                                        className="aspect-square rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center hover:border-red-200 cursor-pointer"
                                                                                    >
                                                                                        <Trash2 className="w-4 h-4 text-red-300" />
                                                                                    </div>

                                                                                    {pickerSourceMode === 'pdf' ? (
                                                                                        <>
                                                                                            <div className="col-span-3 flex items-center justify-between bg-gray-50 rounded-xl p-2 mb-2 border border-gray-100 shadow-inner">
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        setPickerPageIdx(prev => Math.max(0, prev - 1));
                                                                                                    }}
                                                                                                    disabled={pickerPageIdx === 0}
                                                                                                    className="p-1 px-2 hover:bg-white rounded-lg disabled:opacity-20 transition-all shadow-sm border border-transparent hover:border-gray-200"
                                                                                                >
                                                                                                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                                                                                                </button>
                                                                                                <div className="flex flex-col items-center">
                                                                                                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-[0.2em] mb-0.5">Sorgente PDF</span>
                                                                                                    <div className="text-[10px] font-black text-[#111827] uppercase tracking-wider">
                                                                                                        Pagina {pickerPageIdx + 1} <span className="text-gray-200">/</span> {pdfPages.length}
                                                                                                    </div>
                                                                                                </div>
                                                                                                <button
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        setPickerPageIdx(prev => Math.min(pdfPages.length - 1, prev + 1));
                                                                                                    }}
                                                                                                    disabled={pdfPages.length === 0 || pickerPageIdx === pdfPages.length - 1}
                                                                                                    className="p-1 px-2 hover:bg-white rounded-lg disabled:opacity-20 transition-all shadow-sm border border-transparent hover:border-gray-200"
                                                                                                >
                                                                                                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                                                                                                </button>
                                                                                            </div>
                                                                                            {pdfPages[pickerPageIdx] && (
                                                                                                <>
                                                                                                    {(pdfPages[pickerPageIdx].subImages || []).map((sImg: { preview: string; ref: string }, sIdx: number) => (
                                                                                                        <div
                                                                                                            key={`sub-${pickerPageIdx}-${sIdx}`}
                                                                                                            onMouseEnter={() => setPreviewImage(sImg.preview)}
                                                                                                            onMouseLeave={() => setPreviewImage(null)}
                                                                                                            onClick={(e: React.MouseEvent) => {
                                                                                                                e.stopPropagation();
                                                                                                                const newProducts = [...products];
                                                                                                                const newImages = [...p.images];
                                                                                                                newImages[slot] = { id: Math.random().toString(), url: sImg.preview };
                                                                                                                newProducts[idx] = { ...p, images: newImages.filter(Boolean) as ProductImage[] };
                                                                                                                setProducts(newProducts);
                                                                                                                extractHighResAsset(pickerPageIdx, sImg.ref, idx, slot);
                                                                                                                setActivePicker(null);
                                                                                                            }}
                                                                                                            className="aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-slate-400 cursor-pointer transition-all bg-slate-50/30 hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative"
                                                                                                        >
                                                                                                            <img src={sImg.preview} className="w-full h-full object-contain" />
                                                                                                        </div>
                                                                                                    ))}
                                                                                                    <div
                                                                                                        onMouseEnter={() => setPreviewImage(pdfPages[pickerPageIdx].imageUrl)}
                                                                                                        onMouseLeave={() => setPreviewImage(null)}
                                                                                                        onClick={(e: React.MouseEvent) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newProducts = [...products];
                                                                                                            const newImages = [...p.images];
                                                                                                            newImages[slot] = { id: Math.random().toString(), url: pdfPages[pickerPageIdx].imageUrl };
                                                                                                            newProducts[idx] = { ...p, images: newImages.filter(Boolean) as ProductImage[] };
                                                                                                            setProducts(newProducts);
                                                                                                            setActivePicker(null);
                                                                                                        }}
                                                                                                        className="aspect-square rounded-lg border border-gray-100 overflow-hidden hover:border-gray-500 cursor-pointer transition-all bg-white hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative"
                                                                                                    >
                                                                                                        <img src={pdfPages[pickerPageIdx].imageUrl} className="w-full h-full object-contain" />
                                                                                                    </div>
                                                                                                </>
                                                                                            )}
                                                                                        </>
                                                                                    ) : pickerSourceMode === 'web' ? (
                                                                                        <>
                                                                                            <div className="col-span-3 pb-2 flex flex-col gap-2">
                                                                                                <div className="flex items-center justify-between px-1">
                                                                                                    <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300 transition-colors">
                                                                                                        <input
                                                                                                            type="checkbox"
                                                                                                            checked={useGoogleShopping}
                                                                                                            onChange={(e) => setUseGoogleShopping(e.target.checked)}
                                                                                                            className="w-3.5 h-3.5 text-slate-900 rounded border-gray-300 focus:ring-slate-900"
                                                                                                        />
                                                                                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-wider">Cerca in Google Shopping</span>
                                                                                                    </label>
                                                                                                </div>
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <Search className="w-3 h-3 text-gray-400" />
                                                                                                    <input
                                                                                                        value={pickerSearchQuery}
                                                                                                        onChange={(e) => setPickerSearchQuery(e.target.value)}
                                                                                                        onKeyDown={(e) => e.key === 'Enter' && handleWebSearch(p, pickerSearchQuery)}
                                                                                                        placeholder="Cerca immagini o SKU su Web..."
                                                                                                        className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-bold focus:outline-none focus:border-slate-400"
                                                                                                    />
                                                                                                    <button
                                                                                                        onClick={() => handleWebSearch(p, pickerSearchQuery)}
                                                                                                        className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-900 transition-colors"
                                                                                                    >
                                                                                                        <Search className="w-3 h-3" />
                                                                                                    </button>
                                                                                                </div>
                                                                                            </div>
                                                                                            {isSearchingWeb ? (
                                                                                                <div className="col-span-3 py-8 flex flex-col items-center justify-center gap-2">
                                                                                                    <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                                                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Ricerca in corso...</span>
                                                                                                </div>
                                                                                            ) : (
                                                                                                webResults.map((result: any, rIdx: number) => (
                                                                                                    <div
                                                                                                        key={rIdx}
                                                                                                        onMouseEnter={() => setPreviewImage(result.url)}
                                                                                                        onMouseLeave={() => setPreviewImage(null)}
                                                                                                        onClick={(e: React.MouseEvent) => {
                                                                                                            e.stopPropagation();
                                                                                                            const newProducts = [...products];
                                                                                                            const newImages = [...p.images];
                                                                                                            newImages[slot] = { id: Math.random().toString(), url: result.url };

                                                                                                            let updatedProduct = { ...p, images: newImages.filter(Boolean) as ProductImage[] };
                                                                                                            if (result.productData) {
                                                                                                                let updatedSomething = false;
                                                                                                                if (result.productData.price && (!updatedProduct.price || updatedProduct.price.trim() === '€ 0.00')) {
                                                                                                                    updatedProduct.price = result.productData.price;
                                                                                                                    updatedSomething = true;
                                                                                                                }
                                                                                                                if (result.productData.description && !updatedProduct.description) {
                                                                                                                    updatedProduct.description = result.productData.description;
                                                                                                                    updatedSomething = true;
                                                                                                                }
                                                                                                                if (updatedSomething) toast.success("Dati aggiornati automaticamente da Shopping!");
                                                                                                            }

                                                                                                            newProducts[idx] = updatedProduct;
                                                                                                            setProducts(newProducts);
                                                                                                            setActivePicker(null);
                                                                                                        }}
                                                                                                        className="aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-slate-900 cursor-pointer transition-all hover:scale-[1.8] hover:z-[100] hover:shadow-2xl hover:relative bg-white"
                                                                                                    >
                                                                                                        <img src={result.url} className="w-full h-full object-contain" />
                                                                                                        {result.productData && (
                                                                                                            <div className="absolute top-0 right-0 bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg">SHOPPING</div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                ))
                                                                                            )}
                                                                                        </>
                                                                                    ) : (
                                                                                        <div className="col-span-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-2">
                                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Sorgente Cartella / Drive</p>

                                                                                            <div className="flex flex-col gap-3">
                                                                                                <div className="relative">
                                                                                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        placeholder={`Cerca file o SKU (es. ${p.sku})...`}
                                                                                                        value={pickerSearchQuery}
                                                                                                        onChange={(e) => setPickerSearchQuery(e.target.value)}
                                                                                                        className="w-full bg-white border border-gray-200 rounded-lg pl-7 pr-7 py-1.5 text-[10px] font-bold focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-all"
                                                                                                    />
                                                                                                    {pickerSearchQuery && (
                                                                                                        <button
                                                                                                            onClick={(e) => { e.stopPropagation(); setPickerSearchQuery(""); }}
                                                                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                                                                                                        >
                                                                                                            <X className="w-3 h-3" />
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>

                                                                                                <div
                                                                                                    onClick={() => {
                                                                                                        const targetSku = pickerSearchQuery.trim() || p.sku;
                                                                                                        const fullUrl = resolveAssetUrl(assetBaseUrl, targetSku, assetExtension);
                                                                                                        if (!fullUrl) return;
                                                                                                        const newProducts = [...products];
                                                                                                        const newImages = [...p.images];
                                                                                                        newImages[slot] = { id: Math.random().toString(), url: fullUrl };
                                                                                                        newProducts[idx] = { ...p, images: newImages.filter(Boolean) as ProductImage[] };
                                                                                                        setProducts(newProducts);
                                                                                                        setActivePicker(null);
                                                                                                        setPickerSearchQuery("");
                                                                                                    }}
                                                                                                    className="aspect-video rounded-xl border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center p-2 hover:border-green-400 hover:bg-green-50/20 cursor-pointer group transition-all"
                                                                                                >
                                                                                                    {assetBaseUrl ? (
                                                                                                        <img
                                                                                                            src={resolveAssetUrl(assetBaseUrl, pickerSearchQuery.trim() || p.sku, assetExtension)}
                                                                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                                                            className="w-full h-1/2 object-contain mb-2"
                                                                                                        />
                                                                                                    ) : null}
                                                                                                    <HardDrive className="w-6 h-6 text-gray-300 group-hover:text-green-500 mb-1" />
                                                                                                    <span className="text-[10px] font-bold text-gray-400 text-center line-clamp-2 px-2 break-all">
                                                                                                        {assetBaseUrl ? resolveAssetUrl(assetBaseUrl, pickerSearchQuery.trim() || p.sku, assetExtension) : 'Percorso non configurato'}
                                                                                                    </span>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                        {Object.entries(csvMapping).map(([field, header]) => {
                                                            if (!header || !field || typeof field !== 'string' || field.startsWith('image')) return null;
                                                            const currentCol = { key: field, label: header, isSystem: !extraColumns.includes(field) };
                                                            const val = (p as any)[field] || (p.extraFields?.[field]) || '';

                                                            return (
                                                                <td key={field} className="px-4 py-4 relative">
                                                                    <div className="relative group/edit">
                                                                        <textarea
                                                                            rows={2}
                                                                            value={val}
                                                                            onChange={(e) => {
                                                                                const newProducts = [...products];
                                                                                if (currentCol.isSystem) {
                                                                                    (newProducts[idx] as any)[field] = e.target.value;
                                                                                } else {
                                                                                    newProducts[idx].extraFields = { ...newProducts[idx].extraFields, [field]: e.target.value };
                                                                                }
                                                                                setProducts(newProducts);
                                                                            }}
                                                                            onFocus={() => {
                                                                                setActivePicker({ type: 'text', row: idx, field: field });
                                                                                setPickerSearch("");
                                                                            }}
                                                                            placeholder={header + "..."}
                                                                            className="bg-transparent font-bold text-gray-700 w-[180px] min-h-[50px] hover:bg-slate-50/50 rounded-xl px-4 py-2 text-sm transition-all border border-transparent hover:border-slate-200 cursor-pointer resize break-words whitespace-pre-wrap leading-tight focus:outline-none focus:border-slate-400 focus:bg-white"
                                                                        />

                                                                        <AnimatePresence>
                                                                            {activePicker?.type === 'text' && activePicker.row === idx && activePicker.field === field && (
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: -10 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: -10 }}
                                                                                    className={`absolute z-[200] ${idx < 5 ? 'top-full mt-2' : 'bottom-full mb-2'} left-0 w-80 bg-white border border-gray-100 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.1)] p-6`}
                                                                                    onMouseLeave={() => setActivePicker(null)}
                                                                                >
                                                                                    <div className="flex items-center gap-3 mb-4">
                                                                                        <div className="p-2 bg-slate-50 rounded-xl">
                                                                                            <Database className="w-4 h-4 text-slate-900" />
                                                                                        </div>
                                                                                        <div className="flex-1">
                                                                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Associa Valore</p>
                                                                                            <h4 className="text-xs font-black text-[#111827]">{header}</h4>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="relative mb-4">
                                                                                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                                                                                        <input
                                                                                            autoFocus
                                                                                            type="text"
                                                                                            placeholder="Cerca o digita valore..."
                                                                                            value={pickerSearch || val}
                                                                                            onChange={(e) => setPickerSearch(e.target.value)}
                                                                                            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:bg-white focus:border-slate-300 rounded-2xl text-sm font-bold transition-all outline-none"
                                                                                        />
                                                                                    </div>

                                                                                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 p-1">
                                                                                        {Array.from(new Set(csvMasterList.map(item => String((item as any)[header] || "")).filter(v => v && v.toLowerCase().includes(pickerSearch.toLowerCase())))).slice(0, 15).map((uVal, uIdx) => (
                                                                                            <div
                                                                                                key={uIdx}
                                                                                                onClick={() => {
                                                                                                    const newProducts = [...products];
                                                                                                    const newVal = uVal;
                                                                                                    const match = csvMasterList.find(row =>
                                                                                                        String(row[header] || "").trim().toLowerCase() === newVal.trim().toLowerCase()
                                                                                                    );

                                                                                                    let updated = { ...p };
                                                                                                    if (currentCol.isSystem) {
                                                                                                        (updated as any)[currentCol.key] = newVal;
                                                                                                    } else {
                                                                                                        updated.extraFields = { ...(updated.extraFields || {}), [currentCol.key]: newVal };
                                                                                                    }

                                                                                                    if (match) {
                                                                                                        const systemFieldsKeys = ['sku', 'title', 'docDescription', 'price', 'category', 'brand', 'dimensions', 'weight', 'material', 'bulletPoints', 'description'];
                                                                                                        systemFieldsKeys.forEach(f => {
                                                                                                            if (f === currentCol.key) return;
                                                                                                            const h = csvMapping[f];
                                                                                                            if (h && match[h]) (updated as any)[f] = String(match[h]);
                                                                                                        });

                                                                                                        extraColumns.forEach(ex => {
                                                                                                            if (ex === currentCol.key) return;
                                                                                                            const h = csvMapping[ex];
                                                                                                            if (h && match[h]) {
                                                                                                                updated.extraFields = { ...(updated.extraFields || {}), [ex]: String(match[h]) };
                                                                                                            }
                                                                                                        });
                                                                                                    }

                                                                                                    newProducts[idx] = updated;
                                                                                                    setProducts(newProducts);
                                                                                                    setActivePicker(null);
                                                                                                }}
                                                                                                className="p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-300 flex items-center justify-between group"
                                                                                            >
                                                                                                <span className="text-xs font-bold text-gray-600">{uVal}</span>
                                                                                                <CheckCircle2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100" />
                                                                                            </div>
                                                                                        ))}
                                                                                        {pickerSearch && !csvMasterList.some(i => (i as any)[header] === pickerSearch) && (
                                                                                            <div
                                                                                                onClick={() => {
                                                                                                    const newProducts = [...products];
                                                                                                    const newVal = pickerSearch;
                                                                                                    const match = csvMasterList.find(row =>
                                                                                                        String(row[header] || "").trim().toLowerCase() === newVal.trim().toLowerCase()
                                                                                                    );

                                                                                                    let updated = { ...p };
                                                                                                    if (currentCol.isSystem) {
                                                                                                        (updated as any)[currentCol.key] = newVal;
                                                                                                    } else {
                                                                                                        updated.extraFields = { ...(updated.extraFields || {}), [currentCol.key]: newVal };
                                                                                                    }

                                                                                                    if (match) {
                                                                                                        const systemFieldsKeys = ['sku', 'title', 'docDescription', 'price', 'category', 'brand', 'dimensions', 'weight', 'material', 'bulletPoints', 'description'];
                                                                                                        systemFieldsKeys.forEach(f => {
                                                                                                            if (f === currentCol.key) return;
                                                                                                            const h = csvMapping[f];
                                                                                                            if (h && match[h]) (updated as any)[f] = String(match[h]);
                                                                                                        });

                                                                                                        extraColumns.forEach(ex => {
                                                                                                            if (ex === currentCol.key) return;
                                                                                                            const h = csvMapping[ex];
                                                                                                            if (h && match[h]) {
                                                                                                                updated.extraFields = { ...(updated.extraFields || {}), [ex]: String(match[h]) };
                                                                                                            }
                                                                                                        });
                                                                                                    }

                                                                                                    newProducts[idx] = updated;
                                                                                                    setProducts(newProducts);
                                                                                                    setActivePicker(null);
                                                                                                }}
                                                                                                className="p-3 bg-green-50/50 border border-green-100 rounded-xl cursor-pointer hover:bg-green-100"
                                                                                            >
                                                                                                <span className="text-[10px] font-black text-green-600 uppercase">Salva Nuovo: </span>
                                                                                                <span className="text-xs font-black text-green-700">{pickerSearch}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                            {products.length > displayLimit && (
                                <div className="p-8 flex justify-center border-t border-gray-100 bg-gray-50/10">
                                    <button
                                        onClick={() => setDisplayLimit(prev => prev + 50)}
                                        className="btn-secondary py-2"
                                    >
                                        Mostra altri 50 records
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="erp"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="space-y-10"
                    >
                        {/* ERP Stats Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {[
                                { label: 'Totale Prodotti', value: allDBProducts.length, icon: Package, color: 'text-slate-900', bg: 'bg-slate-50' },
                                { label: 'Cataloghi Attivi', value: new Set(allDBProducts.map(p => p.catalogId)).size, icon: FolderOpen, color: 'text-orange-600', bg: 'bg-orange-50' },
                                { label: 'Valore Stock', value: '€ ' + allDBProducts.reduce((acc, p) => acc + (parseFloat(p.price) || 0), 0).toLocaleString(), icon: BarChart3, color: 'text-green-600', bg: 'bg-green-50' },
                                { label: 'Ultimo Sync', value: 'Oggi 14:30', icon: History, color: 'text-purple-600', bg: 'bg-purple-50' }
                            ].map((stat, i) => (
                                <div key={i} className="main-card p-6 flex items-center gap-6">
                                    <div className={`p-4 ${stat.bg} rounded-2xl`}>
                                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{stat.label}</p>
                                        <p className="text-2xl font-black text-[#111827]">{stat.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Inventory Management Table */}
                        <div className="main-card p-0 overflow-hidden">
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-6 flex-1">
                                    <h3 className="text-xl font-black text-[#111827] flex items-center gap-3">
                                        <Database className="w-5 h-5 text-gray-400" />
                                        Registry Warehouse
                                    </h3>
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            placeholder="Cerca per SKU, Nome o Categoria..."
                                            value={erpSearchQuery}
                                            onChange={(e) => setErpSearchQuery(e.target.value)}
                                            className="w-full bg-gray-50 border border-transparent focus:bg-white focus:border-orange-200 rounded-xl pl-12 pr-4 py-3 text-sm font-bold transition-all outline-none"
                                        />
                                    </div>
                                    <button className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200">
                                        <Filter className="w-5 h-5" />
                                    </button>
                                </div>
                                <button className="btn-primary flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Crea Prodotto
                                </button>
                            </div>

                            <EdgeScroll>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                            <th className="px-6 py-3">SKU</th>
                                            <th className="px-6 py-3">Prodotto</th>
                                            <th className="px-6 py-3">Categoria</th>
                                            <th className="px-6 py-3">Brand</th>
                                            <th className="px-6 py-3">Prezzo</th>
                                            <th className="px-6 py-3">Catalogo Ref</th>
                                            <th className="px-6 py-3 text-right">Azioni</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {isLoadingERP ? (
                                            <tr>
                                                <td colSpan={7} className="px-8 py-20 text-center">
                                                    <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sincronizzazione database...</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            allDBProducts
                                                .filter(p => {
                                                    const search = erpSearchQuery.toLowerCase();
                                                    return p.sku?.toLowerCase().includes(search) ||
                                                        p.title?.toLowerCase().includes(search) ||
                                                        p.category?.toLowerCase().includes(search);
                                                })
                                                .map((res: any, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                                        <td className="px-6 py-3">
                                                            <span className="font-mono font-black text-[10px] bg-slate-900 text-white px-2 py-1 rounded tracking-tight">{res.sku}</span>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                                                                    {res.images?.[0] ? <img src={res.images[0].imageUrl} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-gray-300" />}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[11px] font-black text-[#111827]">{res.title}</p>
                                                                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest">Update 2h ago</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 bg-slate-50 text-slate-900 rounded-full border border-gray-100">{res.category || 'N/A'}</span>
                                                        </td>
                                                        <td className="px-6 py-3 text-[11px] font-bold text-gray-500">{res.brand || '---'}</td>
                                                        <td className="px-6 py-3 font-mono font-black text-[11px] text-[#111827]">€ {res.price || '0.00'}</td>
                                                        <td className="px-6 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">#CAT-0{res.catalogId}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => setEditingProduct({ ...res, images: res.images || [] })}
                                                                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-600 transition-all"
                                                                    title="Modifica"
                                                                >
                                                                    <ChevronRight className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteProductFromERP(res.sku)}
                                                                    className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                                                                    title="Elimina"
                                                                >
                                                                    <Trash2 className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </EdgeScroll>
                        </div>
                    </motion.div>
                )
                }
            </AnimatePresence > {/* MODALS SECTION */}

            {/* Settings Modal (Search Sources) */}
            <AnimatePresence>
                {showSettings && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[2000] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[32px] w-full max-w-2xl shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden border border-white/50"
                        >
                            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white rounded-[20px] shadow-sm">
                                        <Globe className="w-6 h-6 text-orange-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-[#111827]">Web Intelligence Sources</h2>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configura URL di ricerca per questo progetto</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="p-3 hover:bg-white rounded-2xl text-gray-400 transition-all hover:shadow-sm"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {/* Web Sources Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Globe className="w-4 h-4 text-orange-400" />
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#111827]">Web Intelligence Sources</h3>
                                    </div>
                                    <div className="space-y-4">
                                        {searchSources.map((source, sIdx) => (
                                            <div key={sIdx} className="flex items-center gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-md">
                                                <div className="flex-1 space-y-1">
                                                    <input
                                                        value={source.label}
                                                        placeholder="Label (es: Sito Ufficiale)"
                                                        onChange={(e) => {
                                                            const newSources = [...searchSources];
                                                            newSources[sIdx].label = e.target.value;
                                                            setSearchSources(newSources);
                                                        }}
                                                        className="w-full bg-transparent text-xs font-black uppercase tracking-widest text-[#111827] outline-none"
                                                    />
                                                    <input
                                                        value={source.url}
                                                        placeholder="https://..."
                                                        onChange={(e) => {
                                                            const newSources = [...searchSources];
                                                            newSources[sIdx].url = e.target.value;
                                                            setSearchSources(newSources);
                                                        }}
                                                        className="w-full bg-transparent text-sm font-medium text-gray-500 outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newSources = searchSources.filter((_, i) => i !== sIdx);
                                                        setSearchSources(newSources);
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setSearchSources([...searchSources, { label: '', url: '' }])}
                                            className="w-full py-4 border-2 border-dashed border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:border-orange-200 hover:text-orange-500 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Aggiungi Sorgente
                                        </button>
                                    </div>

                                    <div className="mt-6 p-6 bg-slate-50/50 rounded-2xl border border-slate-200">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-slate-900 rounded-lg shadow-sm">
                                                    <Search className="w-4 h-4 text-white" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-[#111827]">Google Shopping</h3>
                                                    <p className="text-[10px] font-bold text-gray-400">Cerca automaticamente prezzi e descrizioni</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={useGoogleShopping}
                                                    onChange={(e) => setUseGoogleShopping(e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-gray-100" />

                                {/* External Assets Section */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2">
                                        <HardDrive className="w-4 h-4 text-slate-400" />
                                        <h3 className="text-sm font-black uppercase tracking-widest text-[#111827]">Assets Esterni (Immagini per SKU)</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50/30 rounded-[28px] border border-slate-200/50">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Indirizzo Base (URL, Drive, Locale)</label>
                                            <input
                                                value={assetBaseUrl}
                                                onChange={(e) => setAssetBaseUrl(e.target.value)}
                                                placeholder="https://mio-sito.it/foto/ o /public/assets/"
                                                className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200 transition-all"
                                            />
                                            <p className="text-[8px] text-blue-300 font-medium px-1">Tip: Usa "https://drive.google.com/uc?id=" per Drive (servono ID diretti).</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Estensione File</label>
                                            <select
                                                value={assetExtension}
                                                onChange={(e) => setAssetExtension(e.target.value)}
                                                className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-200 transition-all"
                                            >
                                                <option value=".jpg">JPG (.jpg)</option>
                                                <option value=".jpeg">JPEG (.jpeg)</option>
                                                <option value=".png">PNG (.png)</option>
                                                <option value=".webp">WEBP (.webp)</option>
                                                <option value=".pdf">PDF (.pdf)</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="p-4 bg-white/60 rounded-2xl border border-slate-200">
                                                <p className="text-[10px] text-slate-900 font-bold leading-relaxed">
                                                    Questa funzione cercherà automaticamente di collegare immagini chiamate come lo SKU.<br />
                                                    Esempio: SKU "ART123" → <span className="text-slate-800 font-black">{assetBaseUrl || '[URL]'}{"ART123"}{assetExtension}</span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-8 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => {
                                        saveSearchSources(searchSources);
                                        setShowSettings(false);
                                    }}
                                    className="btn-primary"
                                >
                                    Salva Configurazione
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Edit Product Modal */}
            <AnimatePresence>
                {editingProduct && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-2xl z-[2000] flex items-center justify-end p-6">
                        <motion.div
                            initial={{ x: "100%", opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: "100%", opacity: 0 }}
                            className="h-full w-full max-w-2xl bg-white shadow-2xl rounded-[3rem] border border-gray-100 flex flex-col overflow-hidden"
                        >
                            <div className="p-10 border-b border-gray-100 bg-white flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="p-4 bg-slate-900 rounded-[1.5rem] shadow-xl shadow-slate-200">
                                        <Package className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-2xl font-black text-[#111827] uppercase tracking-tighter">Master PIM Editor</h2>
                                            <span className="bg-emerald-50 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-widest">Live Sync</span>
                                        </div>
                                        <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">Gestione Anagrafica Centrale • SKU: {editingProduct.sku}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditingProduct(null)}
                                    className="p-3 bg-gray-50 hover:bg-red-50 hover:text-red-500 rounded-2xl text-gray-400 transition-all border border-gray-100"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Modal Tabs Selection */}
                            <div className="px-10 py-6 bg-white border-b border-gray-50 flex items-center gap-2">
                                {[
                                    { id: 'info', label: 'Specifiche Tecniche', icon: Info },
                                    { id: 'images', label: 'Media Assets', icon: ImageIcon },
                                    { id: 'history', label: 'Log Modifiche', icon: History }
                                ].map((tab: { id: string, label: string, icon: any }) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveSection(tab.id as 'info' | 'images' | 'history');
                                            if (tab.id === 'history' && editingProduct.id) {
                                                fetchProductHistory(editingProduct.id);
                                            }
                                        }}
                                        className={`px-6 py-3 rounded-2xl flex items-center gap-3 transition-all ${activeSection === tab.id
                                            ? 'bg-slate-900 text-white shadow-xl shadow-slate-200 -translate-y-0.5'
                                            : 'bg-white text-gray-400 hover:bg-gray-50 border border-transparent hover:border-gray-200'
                                            }`}
                                    >
                                        <tab.icon className={`w-4 h-4 ${activeSection === tab.id ? 'text-white' : 'text-gray-300'}`} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar bg-white">
                                {activeSection === 'info' && (
                                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div className="space-y-2 col-span-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Titolo Prodotto</label>
                                                <input
                                                    value={editingProduct.title || editingProduct.name || ""}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-slate-900 rounded-2xl text-[14px] font-black text-slate-900 transition-all outline-none shadow-sm"
                                                />
                                            </div>

                                            <div className="space-y-2 col-span-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Descrizione Documentale</label>
                                                <textarea
                                                    rows={3}
                                                    value={editingProduct.docDescription || ""}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, docDescription: e.target.value })}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-slate-900 rounded-2xl text-xs leading-relaxed font-bold text-slate-700 transition-all outline-none resize-none shadow-sm"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Prezzo (€)</label>
                                                <input
                                                    value={editingProduct.price}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-emerald-500 rounded-2xl text-[14px] font-black text-emerald-600 outline-none transition-all shadow-sm"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Categoria Market</label>
                                                <input
                                                    value={editingProduct.category}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 focus:bg-white focus:border-slate-900 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-900 outline-none transition-all shadow-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Caratteristiche principali / bullet point</label>
                                                <button
                                                    onClick={() => {
                                                        const currentBullets = (editingProduct.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "");
                                                        currentBullets.push("- ");
                                                        setEditingProduct({ ...editingProduct, bulletPoints: currentBullets.join('\n') });
                                                    }}
                                                    className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full hover:bg-slate-200 transition-all flex items-center gap-1"
                                                >
                                                    <Plus className="w-3 h-3" /> Aggiungi Bullet
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                                {((editingProduct.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "").length === 0 ? [""] : (editingProduct.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "")).map((bullet: string, idx: number) => (
                                                    <div key={idx} className="flex gap-2 items-center group">
                                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black shrink-0 text-[10px]">{idx + 1}</div>
                                                        <input
                                                            value={bullet.replace(/^-\s*/, '')}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const arr = (editingProduct.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "");
                                                                arr[idx] = val ? `- ${val}` : "";
                                                                setEditingProduct({ ...editingProduct, bulletPoints: arr.join('\n') });
                                                            }}
                                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 focus:bg-white focus:border-slate-900 rounded-xl text-sm font-bold text-slate-700 transition-all outline-none shadow-sm"
                                                            placeholder={`Inserisci bullet ${idx + 1}...`}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const arr = (editingProduct.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "");
                                                                arr.splice(idx, 1);
                                                                setEditingProduct({ ...editingProduct, bulletPoints: arr.join('\n') });
                                                            }}
                                                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2 pb-10">
                                            <div className="flex items-center justify-between mb-4">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Attributi Tecnici Dinamici</label>
                                                <button
                                                    onClick={() => {
                                                        const fieldName = prompt("Nome del nuovo attributo (es: Materiale, Voltaggio):");
                                                        if (fieldName) {
                                                            const updatedExtra = { ...editingProduct.extraFields, [fieldName]: "" };
                                                            setEditingProduct({ ...editingProduct, extraFields: updatedExtra });
                                                            if (!extraColumns.includes(fieldName)) {
                                                                setExtraColumns([...extraColumns, fieldName]);
                                                            }
                                                        }
                                                    }}
                                                    className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all"
                                                >
                                                    <Plus className="w-4 h-4 text-slate-900" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {Object.entries(editingProduct.extraFields || {}).map(([key, value]: [string, any]) => (
                                                    <div key={key} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2 group/field">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{key}</span>
                                                            <button
                                                                onClick={() => {
                                                                    const { [key]: _, ...rest } = editingProduct.extraFields;
                                                                    setEditingProduct({ ...editingProduct, extraFields: rest });
                                                                }}
                                                                className="opacity-0 group-hover/field:opacity-100 p-1 hover:text-red-500 transition-all"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <input
                                                            value={value as string}
                                                            onChange={(e) => {
                                                                const updatedExtra = { ...editingProduct.extraFields, [key]: e.target.value };
                                                                setEditingProduct({ ...editingProduct, extraFields: updatedExtra });
                                                            }}
                                                            className="w-full bg-white border border-gray-100 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:border-slate-900 transition-all shadow-sm"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeSection === 'images' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="grid grid-cols-3 gap-6">
                                            {editingProduct.images.map((img: ProductImage, i: number) => (
                                                <div key={i} className="relative aspect-square rounded-3xl overflow-hidden border-2 border-slate-100 group shadow-lg">
                                                    <img src={img.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button
                                                            onClick={() => {
                                                                const newImgs = editingProduct.images.filter((_: ProductImage, idx: number) => idx !== i);
                                                                setEditingProduct({ ...editingProduct, images: newImgs });
                                                            }}
                                                            className="p-4 bg-white text-red-500 rounded-2xl shadow-2xl hover:scale-110 transition-all"
                                                        >
                                                            <Trash2 className="w-6 h-6" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <button className="aspect-square rounded-3xl border-3 border-dashed border-gray-100 flex flex-col items-center justify-center gap-3 text-gray-300 hover:border-slate-300 hover:text-slate-400 transition-all hover:bg-gray-50/50">
                                                <Plus className="w-10 h-10" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Aggiungi Asset</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeSection === 'history' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-slate-50/50 p-8 rounded-[2rem] border border-gray-100">
                                            <div className="flex items-center justify-between mb-8">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modifiche Storiche</h4>
                                                <button
                                                    onClick={() => editingProduct.id && fetchProductHistory(editingProduct.id)}
                                                    className="p-2 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 transition-all"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {isLoadingHistory ? (
                                                    <div className="py-20 flex flex-col items-center justify-center opacity-30 gap-4">
                                                        <RefreshCw className="w-8 h-8 animate-spin" />
                                                        <span className="text-[10px] font-black uppercase">Sincronizzazione log...</span>
                                                    </div>
                                                ) : productHistory.length === 0 ? (
                                                    <div className="py-20 flex flex-col items-center justify-center opacity-20 gap-4">
                                                        <History className="w-12 h-12" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">Nessuna modifica registrata</p>
                                                    </div>
                                                ) : (
                                                    productHistory.map((entry: any, idx: number) => (
                                                        <div key={entry.id} className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                                                            <div className="flex items-center gap-6">
                                                                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-white font-black">
                                                                    <span className="text-[8px] opacity-40 leading-none mb-1">REV</span>
                                                                    <span className="text-sm">#{productHistory.length - idx}</span>
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-900">{new Date(entry.createdAt).toLocaleString('it-IT')}</p>
                                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Stato snapshot archiviato</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm("Ripristinare questo stato precedente?")) {
                                                                        setEditingProduct({ ...editingProduct, ...entry.data });
                                                                        setActiveSection('info');
                                                                        toast.success("Dati ripristinati con successo!");
                                                                    }
                                                                }}
                                                                className="px-6 py-3 bg-gray-50 hover:bg-slate-900 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-gray-100 hover:border-slate-900 shadow-sm"
                                                            >
                                                                Ripristina
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-10 border-t border-gray-100 bg-white flex items-center justify-between z-20">
                                <button
                                    onClick={() => setEditingProduct(null)}
                                    className="px-10 py-5 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-red-500 transition-all italic underline decoration-2 underline-offset-8"
                                >
                                    Esci senza salvare
                                </button>
                                <button
                                    onClick={() => updateProductInERP(editingProduct)}
                                    className="px-12 py-5 bg-slate-900 hover:bg-black text-white rounded-[1.5rem] font-black uppercase text-[11px] tracking-[0.2em] shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-4 hover:scale-[1.02] active:scale-95 transition-all"
                                >
                                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                    Push to Registry
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Premium Visualizer Preview Overlay (Persistent) */}
            <AnimatePresence>
                {previewImage && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, x: activePicker ? -20 : 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: activePicker ? -20 : 20 }}
                        className={`fixed ${activePicker ? 'bottom-8 left-8' : 'bottom-8 right-8'} w-72 h-72 bg-white shadow-[0_40px_100px_rgba(0,0,0,0.25)] rounded-[24px] border border-white/50 z-[9999] p-4 backdrop-blur-xl flex flex-col gap-3 pointer-events-none transition-all duration-500`}
                    >
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-50 rounded-lg">
                                    <Maximize2 className="w-4 h-4 text-orange-600" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest text-[#111827]">Visualizzazione HD</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 py-1 bg-gray-50 rounded-full">Asset Originale</span>
                        </div>
                        <div className="flex-1 rounded-2xl overflow-hidden bg-gray-50 flex items-center justify-center">
                            <img
                                src={previewImage || undefined}
                                className="w-full h-full object-contain"
                                alt="High Resolution Preview"
                            />
                        </div>
                        <div className="pt-4 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 0.5 }}
                                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600"
                                />
                            </div>
                            <span className="text-[9px] font-black text-orange-600 uppercase">Analisi In Corso</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Persistent PDF QuickView Side Panel */}
            <AnimatePresence>
                {isQuickPdfOpen && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        className="fixed top-0 right-0 h-full w-[500px] bg-white shadow-2xl z-[3000] border-l border-gray-100 flex flex-col overflow-hidden"
                    >
                        <div className="p-4 bg-gray-900 border-b border-white/10 flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-orange-400" />
                                <h3 className="text-xs font-black uppercase tracking-widest">PDF Content Library</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPdfSearchFocus(null)}
                                    className="p-1 px-3 bg-white/10 rounded-full text-[9px] font-black uppercase hover:bg-white/20 transition-all"
                                >
                                    Reset View
                                </button>
                                <button
                                    onClick={() => setIsQuickPdfOpen(false)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-3 bg-slate-50 border-b border-gray-100 flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    placeholder="Libera ricerca nel documento..."
                                    value={pdfSearchFocus || ""}
                                    onChange={(e) => setPdfSearchFocus(e.target.value)}
                                    className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-[10px] font-bold outline-none focus:border-orange-400"
                                />
                            </div>
                            <span className="text-[9px] font-black text-gray-400 uppercase">{pdfPages.length} Pagine</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar bg-gray-50/30">
                            {pdfPages
                                .filter((page: PageData) => {
                                    if (!pdfSearchFocus) return true;
                                    const search = pdfSearchFocus.toLowerCase();
                                    return page.text.toLowerCase().includes(search);
                                })
                                .map((page: PageData, pageIdx: number) => (
                                    <div key={pageIdx} className="space-y-4">
                                        <div className="flex items-center justify-between px-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pagina {page.pageNumber}</span>
                                                <span className="text-[8px] font-bold text-gray-300 uppercase italic">ID: {page.pageNumber}_{pdfPages.length}</span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const foundSkus = page.text.match(/[A-Z0-9-]{4,}/g) || [];
                                                    const uniqueSkus = Array.from(new Set(foundSkus));
                                                    if (uniqueSkus.length > 0) {
                                                        toast.success(`Trovati ${uniqueSkus.length} SKU: ${uniqueSkus.slice(0, 3).join(', ')}...`);
                                                        setPdfSearchFocus(uniqueSkus[0]);
                                                    } else {
                                                        toast.warning("Nessun SKU riconosciuto in questa pagina");
                                                    }
                                                }}
                                                className="text-[9px] font-black uppercase text-orange-600 hover:text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full transition-all border border-orange-100/50"
                                            >
                                                Analizza Testo
                                            </button>
                                        </div>
                                        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden group/page relative ring-1 ring-black/5 hover:ring-orange-400/50 transition-all duration-300">
                                            <img
                                                src={page.imageUrl}
                                                alt={`Page ${page.pageNumber}`}
                                                className="w-full h-auto cursor-zoom-in group-hover/page:opacity-90 transition-all duration-500 transform group-hover/page:scale-[1.02]"
                                                onClick={() => setPreviewImage(page.imageUrl)}
                                            />
                                            {/* Page Mini-Overlay for Data Mapping */}
                                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/page:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
                                                <button
                                                    onClick={() => {
                                                        const foundSkus = page.text.match(/[A-Z0-9-]{4,}/g) || [];
                                                        const uniqueSkus = Array.from(new Set(foundSkus));
                                                        if (uniqueSkus.length === 0) {
                                                            toast.error("Nessun SKU trovato in questa pagina per sincronizzare");
                                                            return;
                                                        }
                                                        const updatedProducts = products.map((p: ProductData) => {
                                                            if (uniqueSkus.some(s => s.toLowerCase() === p.sku?.toLowerCase())) {
                                                                // If matched, we add current page as reference if not there
                                                                const pageRel = `PAGE_REF_${page.pageNumber}`;
                                                                if (!p.images.some((img: ProductImage) => img.url === pageRel)) {
                                                                    return { ...p, images: [...p.images, { id: Math.random().toString(), url: pageRel }] };
                                                                }
                                                            }
                                                            return p;
                                                        });
                                                        setProducts(updatedProducts);
                                                        toast.success(`Sincronizzati ${uniqueSkus.length} SKU mappati in questa pagina`);
                                                    }}
                                                    className="bg-white text-slate-900 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-2xl hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all w-48 border border-white/20"
                                                >
                                                    Sincronizza Dati
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        // Logic to extract sub-images or just set the page as primary image for found SKUs
                                                        const foundSkus = page.text.match(/[A-Z0-9-]{4,}/g) || [];
                                                        if (foundSkus.length === 0) {
                                                            toast.error("Impossibile estrarre immagini: SKU non identificati");
                                                            return;
                                                        }
                                                        toast.info(`Estrazione asset per: ${foundSkus.join(', ')}`);
                                                        // ...
                                                    }}
                                                    className="bg-orange-600 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-2xl hover:bg-orange-500 hover:scale-105 active:scale-95 transition-all w-48 border border-orange-400/50"
                                                >
                                                    Extract Images
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                            {pdfPages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                                    <AlertTriangle className="w-12 h-12 mb-4 text-gray-300" />
                                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nessun PDF caricato</p>
                                    <p className="text-[10px] font-bold text-gray-300 mt-2 leading-relaxed">Carica un file documentale per sbloccare la ricerca intelligente.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isDeepSearchOpen && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        className="fixed top-0 right-0 h-full w-[600px] bg-white shadow-2xl z-[3001] border-l border-gray-100 flex flex-col overflow-hidden"
                    >
                        <div className="p-4 bg-indigo-900 border-b border-white/10 flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                                <Search className="w-4 h-4 text-indigo-400" />
                                <h3 className="text-xs font-black uppercase tracking-widest">Global Historical Records</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleGlobalDeepSearch(pdfSearchFocus || "")}
                                    className="p-1 px-3 bg-white/10 rounded-full text-[9px] font-black uppercase hover:bg-white/20 transition-all flex items-center gap-2"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isSearchingDeep ? 'animate-spin' : ''}`} />
                                    Aggiorna Ricerca
                                </button>
                                <button
                                    onClick={() => setIsDeepSearchOpen(false)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-3 bg-indigo-50/30 border-b border-gray-100 flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        placeholder="Cerca SKU nel database globale..."
                                        value={pdfSearchFocus || ""}
                                        onChange={(e) => setPdfSearchFocus(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleGlobalDeepSearch(pdfSearchFocus || "")}
                                        className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-[10px] font-bold outline-none focus:border-indigo-400 shadow-sm"
                                    />
                                </div>
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">{deepSearchResults.length} Matches</span>
                            </div>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest px-1">Risultati estratti dai cataloghi sincronizzati in precedenza</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar bg-gray-50/20">
                            {deepSearchResults.map((res: any, idx: number) => (
                                <div key={idx} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                    <div className="flex items-center justify-between px-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">{res.catalogName}</span>
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Pagina {res.pageNumber}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                // Function to use this historical image as current product image
                                                // Find if SKU matches local products
                                                const matchIdx = products.findIndex(p => p.sku.toLowerCase() === pdfSearchFocus?.toLowerCase());
                                                if (matchIdx !== -1) {
                                                    const updated = [...products];
                                                    updated[matchIdx] = {
                                                        ...updated[matchIdx],
                                                        images: [...updated[matchIdx].images, { id: Math.random().toString(), url: res.imageUrl }]
                                                    };
                                                    setProducts(updated);
                                                    toast.success("Immagine storica associata correttamente");
                                                }
                                            }}
                                            className="text-[9px] font-black uppercase text-indigo-600 hover:text-white bg-indigo-50 border border-indigo-100 hover:bg-indigo-600 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                                        >
                                            Usa questo Asset
                                        </button>
                                    </div>
                                    <div className="bg-white rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden group/hist relative">
                                        <img
                                            src={res.imageUrl}
                                            className="w-full h-auto cursor-zoom-in group-hover/hist:opacity-90 transition-all duration-500"
                                            onClick={() => setPreviewImage(res.imageUrl)}
                                        />
                                        <div className="p-4 bg-gray-50/80 backdrop-blur-sm border-t border-gray-100">
                                            <p className="text-[9px] font-bold text-gray-500 italic leading-relaxed">
                                                Snippet: &quot;{res.snippet}&quot;
                                            </p>
                                        </div>
                                        {/* Page Mini-Overlay */}
                                        <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover/hist:opacity-100 transition-all flex items-center justify-center pointer-events-none">
                                            <span className="text-white text-[9px] font-black uppercase tracking-[0.2em] bg-indigo-900 px-6 py-3 rounded-2xl shadow-2xl">Archived Asset</span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {deepSearchResults.length === 0 && !isSearchingDeep && (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                                    <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
                                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Nessun match storico</p>
                                    <p className="text-[10px] font-bold text-gray-300 mt-2 leading-relaxed">Esegui una ricerca per SKU per trovare riferimenti in cataloghi passati.</p>
                                </div>
                            )}

                            {isSearchingDeep && (
                                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                                    <RefreshCw className="w-10 h-10 mb-4 text-indigo-400 animate-spin" />
                                    <p className="text-xs font-black uppercase tracking-widest text-indigo-900">Interrogazione AI Database...</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick PDF Trigger Button (Sticky Floating) */}
            <div className="fixed bottom-8 right-8 z-[2001] flex flex-col gap-3">
                <button
                    onClick={() => setIsQuickPdfOpen(!isQuickPdfOpen)}
                    className="p-4 bg-gray-900 text-white rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:scale-110 active:scale-95 transition-all group"
                >
                    <FileText className={`w-6 h-6 ${isQuickPdfOpen ? 'text-orange-400' : 'text-white'}`} />
                    <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-[10px] font-black uppercase tracking-widest text-white rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all">
                        {isQuickPdfOpen ? 'Chiudi Documento' : 'Sfoglia PDF Catalogo'}
                    </span>
                    {pdfPages.length > 0 && !isQuickPdfOpen && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">{pdfPages.length}</span>
                    )}
                </button>
            </div>
        </div >
    );
}

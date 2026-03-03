"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
    Search, Plus, Trash2, Upload, FileText, ImageIcon, Check, MousePointer2, Settings, List,
    HardDrive, Filter, Download, ExternalLink, Scissors, Wand2, Globe, ScanSearch, Sparkles,
    FolderOpen, ChevronLeft, ChevronRight, RefreshCw, Languages, ShoppingCart, Box,
    LayoutGrid, Package, Edit, X, CheckCircle2, History as HistoryIcon, AlertCircle, Save, Image as ImageIconLucide
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import EdgeScroll from "./EdgeScroll";
import { SearchableSelect } from "./SearchableSelect";
import { MultiSearchableSelect } from "./MultiSearchableSelect";

export default function ErpTable() {
    const [products, setProducts] = useState<any[]>([]);
    const [allCategories, setAllCategories] = useState<any[]>([]);
    const [projectName, setProjectName] = useState("Nessun progetto aperto");
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'images' | 'seo' | 'attributes' | 'woocommerce' | 'history'>('info');
    const [productHistory, setProductHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [newImageUrl, setNewImageUrl] = useState("");
    const [webImages, setWebImages] = useState<string[]>([]);
    const [isSearchingWeb, setIsSearchingWeb] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [pdfSearchResults, setPdfSearchResults] = useState<any[]>([]);
    const [isSearchingPdf, setIsSearchingPdf] = useState(false);
    const [allTags, setAllTags] = useState<any[]>([]);
    const [editLang, setEditLang] = useState<string>("it");
    const [isTranslating, setIsTranslating] = useState(false);
    const [productTranslations, setProductTranslations] = useState<Record<string, any>>({});

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

    const CorporateImage = ({ src, alt, className }: { src: any, alt: string, className?: string }) => {
        const [error, setError] = useState(false);
        const isInvalid = !src || (typeof src === 'string' && src.startsWith("PAGE_REF_"));
        if (error || isInvalid) return (
            <div className={`flex items-center justify-center bg-slate-50 border border-slate-100 ${className}`}>
                <Box className="w-1/3 h-1/3 text-slate-200" />
            </div>
        );
        const resolvedSrc = typeof src === 'string' ? src : src?.url;
        return <img src={resolvedSrc} alt={alt} className={className} onError={() => setError(true)} />;
    };
    const [brandFilter, setBrandFilter] = useState<string>("all");
    const [categoryFilter, setCategoryFilter] = useState<string | number>("all");
    const [subCategoryFilter, setSubCategoryFilter] = useState<string | number>("all");
    const [subSubCategoryFilter, setSubSubCategoryFilter] = useState<string | number>("all");
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [showWooConfig, setShowWooConfig] = useState(false);
    const [wooConfig, setWooConfig] = useState({
        domain: "",
        key: "",
        secret: ""
    });
    const [wooFields, setWooFields] = useState<string[]>([]);
    const [isConnectingWoo, setIsConnectingWoo] = useState(false);
    const [isPublishingWoo, setIsPublishingWoo] = useState(false);

    const fetchCategories = async () => {
        try {
            const res = await axios.get('/api/categories?all=true');
            setAllCategories(res.data);
        } catch (err) { }
    };

    const fetchTags = async () => {
        try {
            const res = await axios.get('/api/tags');
            setAllTags(res.data);
        } catch (err) { }
    };

    useEffect(() => {
        const saved = localStorage.getItem("pim_woo_config");
        if (saved) setWooConfig(JSON.parse(saved));
        fetchProducts(); // Initial data load
        fetchCategories();
        fetchTags();
        const savedProjectName = localStorage.getItem("pdf_catalog_project_name");
        if (savedProjectName) setProjectName(savedProjectName);
    }, []);

    const testWooConnection = async () => {
        setIsConnectingWoo(true);
        try {
            const res = await axios.get("/api/integrations/woocommerce", { params: wooConfig });
            setWooFields(res.data.fields || []);
            toast.success(`Connesso! WooCommerce ha ${res.data.totalFound} prodotti.`);
            localStorage.setItem("pim_woo_config", JSON.stringify(wooConfig));
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Connessione fallita");
        } finally {
            setIsConnectingWoo(false);
        }
    };

    const handleAddCategory = async (name: string, parentId: number | null, level: 1 | 2 | 3) => {
        try {
            const res = await axios.post('/api/categories', { name, parentId });
            setAllCategories([...allCategories, res.data]);
            if (level === 1) setSelectedProduct({ ...selectedProduct, categoryId: res.data.id, subCategoryId: null, subSubCategoryId: null });
            if (level === 2) setSelectedProduct({ ...selectedProduct, subCategoryId: res.data.id, subSubCategoryId: null });
            if (level === 3) setSelectedProduct({ ...selectedProduct, subSubCategoryId: res.data.id });
            toast.success("Categoria creata!");
        } catch (err) {
            toast.error("Errore creazione categoria");
        }
    };

    const publishToWoo = async (product: any) => {
        if (!wooConfig.domain || !wooConfig.key) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab('woocommerce');
            return;
        }
        setIsPublishingWoo(true);
        try {
            const res = await axios.post("/api/integrations/woocommerce", {
                ...wooConfig,
                product
            });
            toast.success(`Prodotto pubblicato! ID WooCommerce: ${res.data.wooId}`);
            // Update local product with wooId
            const updated = { ...product, wooId: res.data.wooId };
            setSelectedProduct(updated);
            handleSave(); // save to our db
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Errore di pubblicazione");
        } finally {
            setIsPublishingWoo(false);
        }
    };

    const fetchProductHistory = async (id: number) => {
        setIsLoadingHistory(true);
        try {
            const res = await axios.get(`/api/products/${id}/history`);
            setProductHistory(res.data);
        } catch (err) {
            console.error("Failed to fetch history:", err);
            toast.error("Impossibile caricare la cronologia");
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history' && selectedProduct?.id) {
            fetchProductHistory(selectedProduct.id);
        }
    }, [activeTab, selectedProduct?.id]);

    const handleGenerateAIDescription = async () => {
        if (!selectedProduct) return;
        setIsGeneratingAI(true);
        const toastId = 'ai-desc-erp';
        toast.loading("L'AI sta scrivendo la descrizione...", { toastId });

        try {
            const { images, extraFields, docDescription, ...cleanProductData } = selectedProduct;

            const response = await fetch("/api/ai/describe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productData: {
                        ...cleanProductData,
                        docDescription: docDescription?.substring(0, 2000) || "",
                        extraFieldsPreview: extraFields ? Object.entries(extraFields).map(([k, v]) => `${k}: ${v}`).join(", ").substring(0, 1000) : ""
                    },
                    language: "it"
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

                    // Parse parts using regex
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
                        lines.forEach((line: string) => {
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

                    setSelectedProduct((prev: any) => {
                        if (!prev) return null;
                        const tt = { ...(prev.translations || {}) };
                        if (!tt[editLang]) tt[editLang] = {};

                        tt[editLang] = {
                            ...tt[editLang],
                            seoAiText: newShortDescription || tt[editLang].seoAiText,
                            description: newDescription || (accumulated.includes('---TECHNICAL_FIELDS---') ? "" : accumulated.replace('---DESCRIPTION---', '').trim()),
                            bulletPoints: newBullets || tt[editLang].bulletPoints,
                        };

                        return {
                            ...prev,
                            translations: tt,
                            extraFields: {
                                ...(prev.extraFields || {}),
                                ...parsedFields
                            }
                        };
                    });
                }
            }

            toast.dismiss(toastId);
            toast.success("Scheda Prodotto generata!");
        } catch (error: any) {
            console.error("AI Generation Error:", error);
            toast.error("Errore di connessione o generazione: " + error.message, { toastId });
        } finally {
            setIsGeneratingAI(false);
        }
    };




    const handleDeepPdfSearch = async () => {
        if (!selectedProduct) return;
        setIsSearchingPdf(true);
        setPdfSearchResults([]);
        const query = selectedProduct.sku;
        const toastId = 'deep-pdf-search';
        toast.loading(`Analisi PDF in corso per ${query}...`, { toastId });

        try {
            const res = await axios.get(`/api/catalogues/deep-search`, {
                params: { q: query, catalogId: selectedProduct.catalogId },
                timeout: 15000 // 15 seconds max for deep DB scan
            });
            const results = res.data || [];
            setPdfSearchResults(results);

            if (results.length > 0) {
                toast.update(toastId, {
                    render: `Trovate ${results.length} corrispondenze nei PDF`,
                    type: "success",
                    isLoading: false,
                    autoClose: 3000
                });
            } else {
                toast.update(toastId, {
                    render: "Nessuna corrispondenza trovata nei documenti PDF storici",
                    type: "warning",
                    isLoading: false,
                    autoClose: 3000
                });
            }
        } catch (err: any) {
            console.error("Deep search UI error:", err);
            const errMsg = err.response?.data?.message || err.message || "Errore sconosciuto";
            toast.update(toastId, {
                render: `Errore durante il Deep Scan del PDF: ${errMsg}`,
                type: "error",
                isLoading: false,
                autoClose: 5000
            });
            setPdfSearchResults([]);
        } finally {
            setIsSearchingPdf(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Sei sicuro di voler eliminare massivamente ${selectedIds.length} prodotti?`)) return;
        setIsBulkDeleting(true);
        try {
            await axios.post("/api/products/bulk", { ids: selectedIds, action: "delete" });
            toast.success(`${selectedIds.length} prodotti eliminati con successo`);
            setSelectedIds([]);
            fetchProducts();
        } catch (err) {
            toast.error("Errore durante l'eliminazione massiva");
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const res = await axios.get("/api/products");
            if (Array.isArray(res.data)) {
                setProducts(res.data);
            } else {
                console.error("Dati ricevuti non validi (possibile redirect di login):", res.data);
                toast.error("Sessione scaduta o dati non validi. Ricarica la pagina.");
            }
        } catch (err: any) {
            toast.error("Errore nel caricamento del Server PIM");
        } finally {
            setLoading(false);
        }
    };

    const uniqueBrands = Array.from(new Set(products.map((p: any) => p.brand).filter(Boolean)));
    const uniqueCategories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean)));

    const handleSave = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            await axios.post("/api/products", selectedProduct);
            toast.success("Prodotto aggiornato con successo");
            setSelectedProduct(null);
            fetchProducts(); // refresh table
        } catch (err) {
            toast.error("Errore salvataggio prodotto");
        } finally {
            setIsSaving(false);
        }
    };

    const handleTranslateProduct = async () => {
        if (!selectedProduct) return;

        // Trova una lingua sorgente che abbia del contenuto. Preferisci 'it' se presente.
        const sourceLang = selectedProduct.translations?.['it']?.title ? 'it' : (Object.keys(selectedProduct.translations || {}).find(l => selectedProduct.translations[l]?.title) || 'it');

        if (sourceLang === editLang) {
            toast.warning("Nessuna lingua sorgente diversa trovata (o lingua uguale)");
            return;
        }

        setIsTranslating(true);
        const toastId = 'translate-erp';
        toast.loading(`Mappando PIM da ${sourceLang.toUpperCase()} a ${editLang.toUpperCase()}...`, { toastId });

        try {
            const dataToTranslate = {
                title: selectedProduct.translations?.[sourceLang]?.title || "",
                description: selectedProduct.translations?.[sourceLang]?.description || "",
                seoAiText: selectedProduct.translations?.[sourceLang]?.seoAiText || "",
                bulletPoints: selectedProduct.translations?.[sourceLang]?.bulletPoints || ""
            };

            const response = await fetch("/api/ai/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    textData: dataToTranslate,
                    targetLanguage: editLang
                })
            });

            if (!response.ok) throw new Error("Errore API Traduzione");

            const translated = await response.json();

            setSelectedProduct((prev: any) => {
                if (!prev) return null;
                const tt = { ...(prev.translations || {}) };
                tt[editLang] = {
                    ...tt[editLang],
                    ...translated
                };
                return { ...prev, translations: tt };
            });

            toast.dismiss(toastId);
            toast.success(`Traduzione ${editLang.toUpperCase()} completata!`);
        } catch (error: any) {
            toast.dismiss(toastId);
            toast.error("Errore traduzione: " + error.message);
        } finally {
            setIsTranslating(false);
        }
    };

    const searchWebImages = async (query: string) => {
        if (!query.trim()) return;
        setIsSearchingWeb(true);
        setWebImages([]);
        try {
            const res = await axios.get(`/api/search-images?q=${encodeURIComponent(query)}&shopping=true`);
            setWebImages(res.data.images || []);
            if (res.data.images?.length === 0) toast.warning("Nessuna immagine trovata su Web/Shopping");
        } catch (err) {
            toast.error("Errore ricerca immagini sul web");
        }
        setIsSearchingWeb(false);
    };

    const filteredProducts = products.filter((p: any) => {
        const term = searchTerm.toLowerCase();

        const matchesBrand = brandFilter === "all" || p.brand === brandFilter;
        // Check for category matches by string or ID
        const matchesCategory = categoryFilter === "all" || p.category === categoryFilter || p.categoryId === Number(categoryFilter);
        const matchesSubCategory = subCategoryFilter === "all" || p.subCategoryId === Number(subCategoryFilter);
        const matchesSubSubCategory = subSubCategoryFilter === "all" || p.subSubCategoryId === Number(subSubCategoryFilter);

        if (!matchesBrand || !matchesCategory || !matchesSubCategory || !matchesSubSubCategory) return false;
        if (!term) return true;

        const baseMatch = (p.sku || "").toLowerCase().includes(term) ||
            (p.title || "").toLowerCase().includes(term) ||
            (p.category || "").toLowerCase().includes(term) ||
            (p.brand || "").toLowerCase().includes(term) ||
            (p.description || "").toLowerCase().includes(term) ||
            (p.ean || "").toLowerCase().includes(term) ||
            (p.parentSku || "").toLowerCase().includes(term);

        if (baseMatch) return true;

        // Search in EAV Satellite fields
        if (p.extraFields) {
            for (let key in p.extraFields) {
                if ((p.extraFields[key] || "").toLowerCase().includes(term)) return true;
                if (key.toLowerCase().includes(term)) return true;
            }
        }

        return false;
    });

    const TabButton = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id as 'info' | 'images' | 'seo' | 'attributes' | 'woocommerce' | 'history')}
            className={`flex items-center gap-2 px-8 py-4 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2 relative ${activeTab === id
                ? 'border-[#111827] text-[#111827] bg-white'
                : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
        >
            {Icon && <Icon className={`w-4 h-4 ${activeTab === id ? 'text-[#111827]' : 'text-gray-300'}`} />}
            {label}
            {activeTab === id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#111827]" />
            )}
        </button>
    );

    return (
        <div className="p-5 space-y-5 bg-[#F4F5F7] min-h-screen relative">
            {/* Sticky Main Header */}
            <div className="sticky top-0 z-[60] -mt-5 pt-5 pb-4 px-5 mx-[-1.25rem] bg-[#F4F5F7]/80 backdrop-blur-md border-b border-gray-200/60 shadow-sm">
                <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#111827] rounded-lg shadow-lg rotate-3">
                            <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">PIM Master Library</h1>
                            <div className="flex items-center gap-3">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${projectName === 'Nessun progetto aperto' ? 'bg-red-50 border-red-100 text-red-500 animate-pulse' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                                    PROGETTO: {projectName}
                                </span>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                    <div className="w-1 h-1 bg-gray-300 rounded-full"></div> Master Records
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/40">
                        <div className="flex items-center gap-4 px-3 border-r border-gray-100">
                            <div className="text-center">
                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Prodotti</p>
                                <p className="text-sm font-black text-[#111827] leading-tight">{products.length}</p>
                            </div>
                        </div>

                        <div className="relative group min-w-[300px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within:text-slate-900 transition-colors" />
                            <input
                                type="text"
                                placeholder="Cerca SKU, Titolo, Brand..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white/80 border border-transparent rounded-xl pl-10 pr-3 py-2.5 text-xs font-bold text-gray-900 focus:bg-white focus:border-slate-200 transition-all outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2 border-l border-gray-100 pl-2">
                            <div className="w-[140px]">
                                <SearchableSelect
                                    options={[{ value: 'all', label: 'Tutti i Brand' }, ...uniqueBrands.map(b => ({ value: b, label: b }))]}
                                    value={brandFilter}
                                    onChange={(val) => setBrandFilter(String(val || 'all'))}
                                    placeholder="Filter Brand..."
                                />
                            </div>
                            <div className="w-[160px]">
                                <SearchableSelect
                                    options={[{ value: 'all', label: 'Tutte Categorie' }, ...allCategories.filter(c => !c.parentId).map(c => ({ value: c.id, label: c.name }))]}
                                    value={categoryFilter === 'all' ? 'all' : Number(categoryFilter)}
                                    onChange={(val) => {
                                        setCategoryFilter(val || 'all');
                                        setSubCategoryFilter('all');
                                        setSubSubCategoryFilter('all');
                                    }}
                                    placeholder="Root Category..."
                                />
                            </div>
                            <div className="w-[160px]">
                                <SearchableSelect
                                    options={[{ value: 'all', label: 'Sub-Category' }, ...allCategories.filter(c => c.parentId === Number(categoryFilter)).map(c => ({ value: c.id, label: c.name }))]}
                                    value={subCategoryFilter === 'all' ? 'all' : Number(subCategoryFilter)}
                                    onChange={(val) => {
                                        setSubCategoryFilter(val || 'all');
                                        setSubSubCategoryFilter('all');
                                    }}
                                    placeholder="Sub-Category..."
                                    disabled={categoryFilter === 'all'}
                                />
                            </div>
                            <div className="w-[160px]">
                                <SearchableSelect
                                    options={[{ value: 'all', label: 'Livello 3' }, ...allCategories.filter(c => c.parentId === Number(subCategoryFilter)).map(c => ({ value: c.id, label: c.name }))]}
                                    value={subSubCategoryFilter === 'all' ? 'all' : Number(subSubCategoryFilter)}
                                    onChange={(val) => setSubSubCategoryFilter(val || 'all')}
                                    placeholder="Deep Category..."
                                    disabled={subCategoryFilter === 'all'}
                                />
                            </div>
                        </div>

                        <div className="flex bg-gray-50 p-0.5 rounded-xl border border-gray-100">
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400'}`}
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-400'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={() => setShowWooConfig(true)}
                            className="p-2.5 bg-[#111827] text-white rounded-xl hover:bg-black transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden xl:inline text-[9px] font-black uppercase tracking-widest">Setup Integrazioni</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200/60">
                <div className="px-5 py-3 bg-white border-b border-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">PIM Inventory Engine / Realtime Sync</span>
                    </div>
                </div>
                <EdgeScroll>
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#F9FAFB] border-b border-gray-200 text-slate-400 sticky top-[80px] z-50">
                            <tr>
                                <th className="px-4 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5 cursor-pointer"
                                        checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedIds(filteredProducts.map((p: any) => p.id));
                                            else setSelectedIds([]);
                                        }}
                                    />
                                </th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Asset</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Codice SKU</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Denominazione</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Categoria</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Prezzo</th>
                                <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-12 text-center">
                                        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" />
                                        <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Caricamento Libreria...</p>
                                    </td>
                                </tr>
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-12 text-center">
                                        <Box className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nessun prodotto trovato</p>
                                    </td>
                                </tr>
                            ) : filteredProducts.map((p: any) => (
                                <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.includes(p.id) ? 'bg-slate-50/80' : ''}`}>
                                    <td className="px-4 py-2.5">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5"
                                            checked={selectedIds.includes(p.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedIds([...selectedIds, p.id]);
                                                else setSelectedIds(selectedIds.filter((id: number) => id !== p.id));
                                            }}
                                        />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden">
                                            <CorporateImage src={p.images && p.images[0]?.url} alt={p.sku} className="w-full h-full object-contain" />
                                        </div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className="font-mono text-[11px] font-black text-slate-700 bg-gray-100/80 px-2 py-1 rounded border border-gray-200/50">{p.sku}</span>
                                        {p.ean && (
                                            <div className="mt-1 text-[8px] font-bold text-gray-300 tracking-wider">EAN: {p.ean}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <button
                                            onClick={() => setSelectedProduct(p)}
                                            className="font-bold text-[13px] text-gray-900 hover:text-slate-600 transition-colors text-left block leading-tight mb-1"
                                        >
                                            {p.title || "Prodotto Senza Titolo"}
                                        </button>
                                        <div className="text-[10px] font-medium text-gray-400 line-clamp-1 max-w-md italic">{p.description}</div>
                                    </td>
                                    <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">{p.category || "-"}</td>
                                    <td className="px-4 py-2.5 font-black text-xs text-[#111827]">€ {parseFloat(p.price || "0").toLocaleString()}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button
                                            onClick={() => setSelectedProduct(p)}
                                            className="p-2 text-gray-400 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition-all"
                                        >
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </EdgeScroll>
            </div>

            {/* Modale Modifica */}
            <AnimatePresence>
                {selectedProduct && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6 overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-[#111827]/40 backdrop-blur-sm"
                            onClick={() => setSelectedProduct(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 10 }}
                            className="relative w-full max-w-6xl bg-[#F9FAFB] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden flex flex-col max-h-[92vh] border border-gray-200"
                        >
                            {/* Header Modale - Corporate Style */}
                            <div className="px-8 py-5 border-b border-gray-200 flex items-center justify-between bg-white z-20">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded tracking-tighter">SKU</span>
                                            <span className="font-mono text-lg font-black text-slate-900 tracking-tight">{selectedProduct.sku}</span>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-500 mt-0.5">{selectedProduct.title || "Record Editor"}</h3>
                                    </div>
                                    <div className="h-10 w-px bg-gray-100 hidden md:block"></div>
                                    <div className="hidden lg:flex items-center gap-4">
                                        <div className="text-center">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Status</p>
                                            <p className="text-[10px] font-black text-green-600 uppercase mt-1">{selectedProduct.status || 'Active'}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Brand</p>
                                            <p className="text-[10px] font-black text-gray-900 uppercase mt-1">{selectedProduct.brand || '-'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="hidden sm:flex items-center gap-2 mr-4">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">PIM EDITOR v2.5</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-gray-100"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Tabs Navigation */}
                            <div className="px-8 bg-white border-b border-gray-100 flex items-center justify-between">
                                <div className="flex overflow-x-auto no-scrollbar">
                                    <TabButton id="info" label="Generale" icon={Package} />
                                    <TabButton id="images" label="Media & Asset" icon={LayoutGrid} />
                                    <TabButton id="seo" label="SEO & AI Content" icon={Sparkles} />
                                    <TabButton id="attributes" label="Specifiche & Bullet" icon={List} />
                                    <TabButton id="woocommerce" label="Omnichannel" icon={Globe} />
                                    <TabButton id="history" label="Cronologia" icon={HistoryIcon} />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
                                        {['it', 'en', 'fr', 'de', 'es'].map((lang: string) => (
                                            <button
                                                key={lang}
                                                onClick={() => setEditLang(lang)}
                                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${editLang === lang ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                    {editLang !== "it" && (
                                        <button
                                            onClick={handleTranslateProduct}
                                            disabled={isTranslating}
                                            className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {isTranslating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                                            Traduci Tutto
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="p-8 overflow-y-auto flex-1 bg-[#F9FAFB] custom-scrollbar">
                                {activeTab === 'info' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="space-y-6">
                                            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-slate-900 rounded-full"></div> Core Information
                                                </h4>
                                                <div className="space-y-5">
                                                    <div>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1">Titolo Prodotto ({editLang})</label>
                                                            <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase">PIM Global Name</span>
                                                        </div>
                                                        <input
                                                            value={selectedProduct.translations?.[editLang]?.title || ""}
                                                            onChange={e => {
                                                                const tt = { ...selectedProduct.translations };
                                                                if (!tt[editLang]) tt[editLang] = {};
                                                                tt[editLang].title = e.target.value;
                                                                setSelectedProduct({ ...selectedProduct, translations: tt });
                                                            }}
                                                            className="w-full bg-white border border-gray-200 rounded-xl px-5 py-4 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-emerald-50 transition-all text-sm shadow-sm"
                                                            placeholder="Inserisci il titolo della variante..."
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Brand</label>
                                                            <input
                                                                value={selectedProduct.brand || ""}
                                                                onChange={e => setSelectedProduct({ ...selectedProduct, brand: e.target.value })}
                                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-slate-50/50 transition-all text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">TAG Prodotto</label>
                                                            <MultiSearchableSelect
                                                                options={allTags.map((t: any) => ({ value: t.id, label: t.name }))}
                                                                value={selectedProduct.productTags?.map((pt: any) => pt.tagId) || []}
                                                                onChange={(newTagIds) => {
                                                                    const newProductTags = newTagIds.map(tid => ({ tagId: tid }));
                                                                    setSelectedProduct({ ...selectedProduct, productTags: newProductTags });
                                                                }}
                                                                onAddNew={async (name) => {
                                                                    try {
                                                                        const res = await axios.post('/api/tags', { name });
                                                                        setAllTags([...allTags, res.data]);
                                                                        const currentTags = selectedProduct.productTags?.map((pt: any) => pt.tagId) || [];
                                                                        setSelectedProduct({ ...selectedProduct, productTags: [...currentTags.map((tid: any) => ({ tagId: tid })), { tagId: res.data.id }] });
                                                                    } catch (err) {
                                                                        toast.error("Errore creazione tag");
                                                                    }
                                                                }}
                                                                placeholder="Associa o crea TAG..."
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t border-gray-50">
                                                        <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Classificazione Categorie</h5>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <div>
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1 mb-2 block">Livello 1 (Root)</label>
                                                                <SearchableSelect
                                                                    options={allCategories.filter((c: any) => !c.parentId).map((c: any) => ({ value: c.id, label: c.name }))}
                                                                    value={selectedProduct.categoryId || null}
                                                                    onAddNew={(name) => handleAddCategory(name, null, 1)}
                                                                    onChange={(val) => {
                                                                        setSelectedProduct({
                                                                            ...selectedProduct,
                                                                            categoryId: val ? Number(val) : null,
                                                                            subCategoryId: null,
                                                                            subSubCategoryId: null
                                                                        });
                                                                    }}
                                                                    placeholder="Categoria Root..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1 mb-2 block">Livello 2 (Sub)</label>
                                                                <SearchableSelect
                                                                    options={allCategories.filter((c: any) => c.parentId === selectedProduct.categoryId).map((c: any) => ({ value: c.id, label: c.name }))}
                                                                    value={selectedProduct.subCategoryId || null}
                                                                    onAddNew={(name) => handleAddCategory(name, selectedProduct.categoryId, 2)}
                                                                    onChange={(val) => {
                                                                        setSelectedProduct({
                                                                            ...selectedProduct,
                                                                            subCategoryId: val ? Number(val) : null,
                                                                            subSubCategoryId: null
                                                                        });
                                                                    }}
                                                                    placeholder="Sottocategoria..."
                                                                    disabled={!selectedProduct.categoryId}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-300 ml-1 mb-2 block">Livello 3 (Sub-Sub)</label>
                                                                <SearchableSelect
                                                                    options={allCategories.filter((c: any) => c.parentId === selectedProduct.subCategoryId).map((c: any) => ({ value: c.id, label: c.name }))}
                                                                    value={selectedProduct.subSubCategoryId || null}
                                                                    onAddNew={(name) => handleAddCategory(name, selectedProduct.subCategoryId, 3)}
                                                                    onChange={(val) => {
                                                                        setSelectedProduct({
                                                                            ...selectedProduct,
                                                                            subSubCategoryId: val ? Number(val) : null
                                                                        });
                                                                    }}
                                                                    placeholder="Sottocategoria LVL 3..."
                                                                    disabled={!selectedProduct.subCategoryId}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-orange-500 rounded-full"></div> Pricing & Identifiers
                                                </h4>
                                                <div className="grid grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Prezzo Listino (€)</label>
                                                        <input
                                                            value={selectedProduct.price || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, price: e.target.value })}
                                                            className="w-full bg-orange-50/20 border border-orange-100 rounded-xl px-4 py-3 font-black text-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-50 transition-all text-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Codice EAN</label>
                                                        <input
                                                            value={selectedProduct.ean || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, ean: e.target.value })}
                                                            placeholder="GTIN-13 / EAN"
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-slate-50/50 transition-all text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-slate-400 rounded-full"></div> Inventory & Meta
                                                </h4>
                                                <div className="grid grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Genitore Varianti (SKU)</label>
                                                        <SearchableSelect
                                                            options={products.map((p: any) => ({
                                                                value: p.sku,
                                                                label: p.sku,
                                                                subLabel: p.title || p.ean
                                                            }))}
                                                            value={selectedProduct.parentSku || null}
                                                            onChange={(val) => setSelectedProduct({ ...selectedProduct, parentSku: val ? String(val) : "" })}
                                                            placeholder="Cerca SKU genitore..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Peso Prodotto (kg)</label>
                                                        <input
                                                            value={selectedProduct.weight || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, weight: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none text-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Status ERP</label>
                                                        <select
                                                            value={selectedProduct.status || "draft"}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, status: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-black uppercase text-[10px] text-gray-900 focus:outline-none transition-all"
                                                        >
                                                            <option value="draft">Bozza</option>
                                                            <option value="published">Pubblicato</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Quantità Stock</label>
                                                        <input
                                                            type="number"
                                                            value={selectedProduct.stock || 0}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, stock: parseInt(e.target.value) })}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-black text-gray-900 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-900 p-8 rounded-3xl shadow-lg text-white space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <RefreshCw className="w-5 h-5 text-blue-200" />
                                                    <h5 className="font-black uppercase tracking-widest text-xs">PIM Insight</h5>
                                                </div>
                                                <p className="text-[11px] font-bold opacity-80 leading-relaxed">
                                                    Questi dati rappresentano la sorgente di verità (Master Record). Qualsiasi modifica qui verrà riflessa in tutti i canali di distribuzione collegati.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'images' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 mb-6 flex items-center gap-2">
                                                <div className="w-1 h-3 bg-slate-900 rounded-full"></div> Digital Asset Management
                                            </h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                                                    selectedProduct.images.map((img: any, i: number) => (
                                                        <div key={img.id || i} className="group relative aspect-square rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 shadow-sm hover:border-blue-300 transition-all">
                                                            <CorporateImage src={img.url} alt={selectedProduct.sku} className="w-full h-full object-contain p-2" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        const newImages = selectedProduct.images.filter((_: any, idx: number) => idx !== i);
                                                                        setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                    }}
                                                                    className="p-2 bg-red-500 text-white rounded-lg shadow-xl transform hover:scale-110 transition-all"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-white/90 backdrop-blur text-slate-900 text-[9px] font-black rounded border border-gray-200">
                                                                {i === 0 ? 'MAIN' : `#${i + 1}`}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-3xl bg-gray-50/50">
                                                        <Box className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nessun asset caricato</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-slate-900 p-10 rounded-[2.5rem] shadow-xl overflow-hidden relative group">
                                            <div className="absolute top-0 right-0 p-10 opacity-[0.05] group-hover:opacity-[0.1] transition-all">
                                                <Package className="w-32 h-32 rotate-12" />
                                            </div>
                                            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                                <div>
                                                    <h4 className="text-xl font-black text-white uppercase tracking-tighter">Deep PDF Asset Extraction</h4>
                                                    <p className="text-sm font-bold text-slate-400 mt-1 max-w-sm">
                                                        Analizza il PDF originale del catalogo per estrarre le pagine in cui compare lo SKU: <span className="text-slate-400">{selectedProduct.sku}</span>.
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={handleDeepPdfSearch}
                                                    disabled={isSearchingPdf}
                                                    className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-400 hover:text-white transition-all shadow-2xl shrink-0 disabled:opacity-50"
                                                >
                                                    {isSearchingPdf ? <RefreshCw className="w-4 h-4 animate-spin mr-2 inline" /> : null}
                                                    Deep Search in PDF
                                                </button>
                                            </div>
                                        </div>

                                        {pdfSearchResults.length > 0 && (
                                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-50/50 space-y-6 animate-in slide-in-from-top-4">
                                                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                                    <Sparkles className="w-4 h-4" /> Asset Trovati nei Cataloghi Originali
                                                </h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {pdfSearchResults.map((res: any, idx: number) => (
                                                        <div key={idx} className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-4">
                                                            <div className="aspect-video relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                                                                <CorporateImage src={res.imageUrl} alt="PDF Page" className="w-full h-full object-cover" />
                                                                <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[9px] font-black px-2 py-1 rounded backdrop-blur">
                                                                    PG {res.pageNumber}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{res.catalogName}</p>
                                                                <p className="text-xs font-bold text-slate-600 italic">"...{res.snippet}..."</p>
                                                            </div>
                                                            <div className="flex gap-2 overflow-x-auto pb-2">
                                                                {res.subImages?.map((sub: any, sIdx: number) => (
                                                                    <div
                                                                        key={sIdx}
                                                                        onClick={async () => {
                                                                            const newImages = [...(selectedProduct.images || []), { id: Date.now().toString(), url: await saveImageToServer(sub.preview, selectedProduct.sku) }];
                                                                            setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                            toast.success("Asset PDF recuperato!");
                                                                        }}
                                                                        className="w-12 h-12 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-slate-900 overflow-hidden shrink-0"
                                                                    >
                                                                        <CorporateImage src={sub.preview} alt="Sub Asset" className="w-full h-full object-contain" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                                                    <Plus className="w-3 h-3 text-slate-900" /> Upload Diretto
                                                </h4>
                                                <div className="flex gap-2">
                                                    <input
                                                        value={newImageUrl}
                                                        onChange={e => setNewImageUrl(e.target.value)}
                                                        placeholder="https://sorgente-immagine.com/asset.jpg"
                                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all text-xs"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            if (newImageUrl.trim()) {
                                                                const toastId = toast.loading("Salvataggio locale...");
                                                                const localUrl = await saveImageToServer(newImageUrl.trim(), selectedProduct.sku);
                                                                const newImages = [...(selectedProduct.images || []), { id: Date.now().toString(), url: localUrl }];
                                                                setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                toast.update(toastId, { render: "Immagine accodata.", type: "success", isLoading: false, autoClose: 2000 });
                                                            }
                                                        }}
                                                        className="px-5 py-3 bg-[#111827] text-white font-black rounded-xl shadow-lg hover:bg-black transition-all"
                                                    >
                                                        <Plus className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                                                    <Globe className="w-3 h-3 text-slate-900" /> Web Scraper Engine
                                                </h4>
                                                <button
                                                    onClick={() => searchWebImages(`${selectedProduct.brand || ''} ${selectedProduct.sku}`.trim() || selectedProduct.title)}
                                                    disabled={isSearchingWeb}
                                                    className="w-full flex justify-center items-center gap-3 px-6 py-4 bg-gray-50 border border-gray-200 text-slate-900 rounded-xl font-black shadow-sm disabled:opacity-50 hover:bg-white hover:border-slate-400 hover:text-slate-900 transition-all uppercase text-[10px] tracking-widest"
                                                >
                                                    {isSearchingWeb ? <RefreshCw className="w-4 h-4 animate-spin text-slate-900" /> : <Search className="w-4 h-4" />}
                                                    Deep Asset Search
                                                </button>
                                            </div>

                                            {webImages.length > 0 && (
                                                <div className="md:col-span-2 bg-white p-8 rounded-3xl border border-gray-200 shadow-sm animate-in zoom-in-95">
                                                    <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-900 mb-6 bg-slate-50 w-max px-3 py-1 rounded-full border border-slate-200 italic">Risultati Ricerca Remota</h5>
                                                    <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-6">
                                                        {webImages.map((wImg: any, idx: number) => (
                                                            <div key={idx} className="relative aspect-square w-28 h-28 shrink-0 rounded-2xl overflow-hidden border border-gray-100 group bg-gray-50 cursor-pointer hover:border-slate-900 shadow-sm"
                                                                onClick={async () => {
                                                                    const url = typeof wImg === 'string' ? wImg : wImg.url;
                                                                    const toastId = toast.loading("Salvataggio locale...");
                                                                    const localUrl = await saveImageToServer(url, selectedProduct.sku);
                                                                    const newImages = [...(selectedProduct.images || []), { id: Date.now().toString(), url: localUrl }];
                                                                    setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                    toast.update(toastId, { render: "Risorsa accodata.", type: "success", isLoading: false, autoClose: 2000 });
                                                                }}>
                                                                <CorporateImage src={typeof wImg === 'string' ? wImg : wImg.url} alt="Web Match" className="w-full h-full object-contain p-2" />
                                                                <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                                                    <div className="p-2 bg-slate-900 text-white rounded-full scale-50 group-hover:scale-100 transition-all">
                                                                        <Plus className="w-4 h-4" />
                                                                    </div>
                                                                </div>
                                                                {(wImg.productData || wImg.source?.includes('Shop')) && (
                                                                    <div className="absolute top-0 right-0 bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-lg flex items-center gap-1">
                                                                        <ShoppingCart className="w-2.5 h-2.5" />
                                                                        SHOPPING
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'seo' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 flex items-center gap-2 w-full">
                                                    <div className="w-1 h-3 bg-indigo-600 rounded-full"></div> Content Mastery & SEO Optimization
                                                </h4>
                                            </div>
                                            <div className="space-y-6">
                                                <div>
                                                    <div className="flex justify-between items-center mb-3">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Copywriting E-commerce (Breve & SEO) ({editLang})</label>
                                                        <button
                                                            onClick={handleGenerateAIDescription}
                                                            disabled={isGeneratingAI}
                                                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.1em] hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
                                                        >
                                                            {isGeneratingAI ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                            Genera con AI
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={selectedProduct.translations?.[editLang]?.seoAiText || ""}
                                                        onChange={e => {
                                                            const tt = { ...selectedProduct.translations };
                                                            if (!tt[editLang]) tt[editLang] = {};
                                                            tt[editLang].seoAiText = e.target.value;
                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                        }}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 min-h-[100px] focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all resize-y custom-scrollbar text-sm leading-relaxed mb-6"
                                                        placeholder="L'estratto breve o meta description apparirà qui..."
                                                    />
                                                    <div className="flex justify-between items-center mb-3">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Copywriting E-commerce (Lungo) ({editLang})</label>
                                                    </div>
                                                    <textarea
                                                        value={selectedProduct.translations?.[editLang]?.description || ""}
                                                        onChange={e => {
                                                            const tt = { ...selectedProduct.translations };
                                                            if (!tt[editLang]) tt[editLang] = {};
                                                            tt[editLang].description = e.target.value;
                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                        }}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-bold text-gray-800 min-h-[300px] focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all resize-y custom-scrollbar text-sm leading-relaxed"
                                                        placeholder="La descrizione professionale apparirà qui..."
                                                    />
                                                </div>
                                                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2 block">Sorgente Dati Tecnici (Non Modificabile)</label>
                                                    <div className="text-[11px] font-mono text-slate-500 bg-white p-4 rounded-xl border border-slate-100 italic leading-relaxed">
                                                        {selectedProduct.docDescription || "Nessun dato sorgente rilevato dal PDF."}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'attributes' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-8">
                                            <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-emerald-600 rounded-full"></div> Caratteristiche principali / bullet point
                                                </h4>
                                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Professional PIM Data</span>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center mb-3">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 block">Caratteristiche principali / bullet point ({editLang})</label>
                                                    <button
                                                        onClick={() => {
                                                            const currentBulletStr = selectedProduct.translations?.[editLang]?.bulletPoints || "";
                                                            const currentBullets = currentBulletStr.split('\n').filter((b: string) => b.trim() !== "");
                                                            currentBullets.push("- Nuovo Bullet");
                                                            const tt = { ...selectedProduct.translations };
                                                            if (!tt[editLang]) tt[editLang] = {};
                                                            tt[editLang].bulletPoints = currentBullets.join('\n');
                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                        }}
                                                        className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full hover:bg-emerald-100 transition-all flex items-center gap-1"
                                                    >
                                                        <Plus className="w-3 h-3" /> Aggiungi Bullet
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                                    {(selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "").map((bullet: string, idx: number) => (
                                                        <div key={idx} className="flex gap-3 items-center group bg-slate-50/50 p-2 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                                                            <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-black shrink-0 text-[10px] shadow-lg shadow-slate-200">{idx + 1}</div>
                                                            <input
                                                                value={bullet.replace(/^-\s*/, '')}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    const arr = (selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "");
                                                                    arr[idx] = val ? `- ${val}` : "";
                                                                    const tt = { ...selectedProduct.translations };
                                                                    if (!tt[editLang]) tt[editLang] = {};
                                                                    tt[editLang].bulletPoints = arr.join('\n');
                                                                    setSelectedProduct({ ...selectedProduct, translations: tt });
                                                                }}
                                                                className="w-full px-4 py-3 bg-white border border-slate-100 focus:border-emerald-300 rounded-xl text-sm font-bold text-gray-800 transition-all outline-none shadow-sm"
                                                                placeholder={`Inserisci bullet ${idx + 1}...`}
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const arr = (selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((b: string) => b.trim() !== "");
                                                                    arr.splice(idx, 1);
                                                                    const tt = { ...selectedProduct.translations };
                                                                    if (!tt[editLang]) tt[editLang] = {};
                                                                    tt[editLang].bulletPoints = arr.join('\n');
                                                                    setSelectedProduct({ ...selectedProduct, translations: tt });
                                                                }}
                                                                className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0 opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-50">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block tracking-widest">Materiale Principale</label>
                                                        <input
                                                            value={selectedProduct.material || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, material: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3.5 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-emerald-50 transition-all text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block tracking-widest">Dimensioni / Calibro</label>
                                                        <input
                                                            value={selectedProduct.dimensions || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, dimensions: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 font-bold text-gray-900 focus:outline-none focus:ring-4 focus:ring-emerald-50 transition-all text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {selectedProduct.extraFields && Object.keys(selectedProduct.extraFields).length > 0 && (
                                                <div className="mt-10 pt-8 border-t border-gray-100">
                                                    <div className="flex items-center gap-3 mb-8">
                                                        <div className="p-2 bg-emerald-50 rounded-lg">
                                                            <Sparkles className="w-4 h-4 text-emerald-600" />
                                                        </div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Extra Dynamics Specifications</p>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                        {Object.entries(selectedProduct.extraFields).map(([key, value]: [string, any]) => (
                                                            <div key={key} className="space-y-2">
                                                                <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1 block">{key}</label>
                                                                <input
                                                                    value={String(value)}
                                                                    onChange={e => {
                                                                        const newExtras = { ...selectedProduct.extraFields, [key]: e.target.value };
                                                                        setSelectedProduct({ ...selectedProduct, extraFields: newExtras });
                                                                    }}
                                                                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 focus:outline-none focus:border-emerald-400 transition-all text-xs shadow-sm"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'woocommerce' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-gradient-to-br from-slate-50 to-white p-10 rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden relative group">
                                            <div className="absolute top-0 right-0 p-10 opacity-[0.03] group-hover:opacity-[0.07] transition-all">
                                                <RefreshCw className="w-48 h-48 rotate-12" />
                                            </div>
                                            <div className="relative z-10 flex items-start gap-8">
                                                <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-2xl shadow-blue-200">
                                                    <RefreshCw className="w-8 h-8" />
                                                </div>
                                                <div>
                                                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Omnichannel Sync Engine</h4>
                                                    <p className="text-sm font-bold text-slate-400 mt-1 max-w-sm">Connetti questo prodotto direttamente al catalogo WooCommerce con mappatura real-time dei campi.</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 relative z-10">
                                                <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">WooID Association</p>
                                                    <p className="font-mono text-2xl font-black text-slate-900 tracking-tight">{selectedProduct.wooId || "NOT_SYNCED"}</p>
                                                </div>
                                                <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sync Probability</p>
                                                    <p className="text-2xl font-black text-emerald-500 tracking-tight flex items-center gap-2">
                                                        100% <span className="text-[10px] text-slate-300">Ready</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => publishToWoo(selectedProduct)}
                                                    disabled={isPublishingWoo}
                                                    className="bg-[#111827] text-white p-8 rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-black transition-all shadow-2xl shadow-slate-200 disabled:opacity-50"
                                                >
                                                    {isPublishingWoo ? <RefreshCw className="w-6 h-6 animate-spin mx-auto" /> : "Push to Store"}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-gray-50 pb-3 mb-6 flex items-center gap-2">
                                                <Settings className="w-3 h-3 text-slate-400" /> Field Mapping Preview
                                            </h4>
                                            <div className="space-y-3">
                                                {['post_title', 'post_content', '_regular_price', '_sku', '_stock'].map((field: string) => (
                                                    <div key={field} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-200 transition-all group">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{field.replace('_', ' ')}</span>
                                                        <div className="h-px bg-gray-200 flex-1 mx-4 opacity-40"></div>
                                                        <span className="text-[11px] font-bold text-slate-900 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200 uppercase italic">Mapped Ready</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeTab === 'history' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-200 shadow-sm">
                                            <div className="flex items-center justify-between mb-8 border-b border-gray-50 pb-6">
                                                <div>
                                                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Audit Log & Versioning</h4>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cronologia completa delle revisioni</p>
                                                </div>
                                                <button
                                                    onClick={() => selectedProduct?.id && fetchProductHistory(selectedProduct.id)}
                                                    className="p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-all border border-slate-100 shadow-sm"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {isLoadingHistory ? (
                                                    <div className="flex flex-col items-center justify-center py-20 opacity-30 gap-4">
                                                        <RefreshCw className="w-10 h-10 animate-spin text-slate-900" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">Caricamento log...</p>
                                                    </div>
                                                ) : productHistory.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-20 opacity-30 gap-4">
                                                        <HistoryIcon className="w-10 h-10 text-slate-900" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">Nessuna revisione trovata</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {productHistory.map((entry: any, idx: number) => (
                                                            <div key={entry.id} className="group flex items-center justify-between p-6 bg-slate-50/50 hover:bg-white border border-gray-100 rounded-3xl transition-all hover:shadow-xl hover:border-slate-200">
                                                                <div className="flex items-center gap-6">
                                                                    <div className="flex flex-col items-center justify-center w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 font-black text-slate-900">
                                                                        <span className="text-[10px] uppercase leading-none text-slate-400 mb-1">REV</span>
                                                                        <span className="text-lg leading-none">#{productHistory.length - idx}</span>
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Check className="w-4 h-4 text-emerald-500" />
                                                                            <p className="text-xs font-black text-slate-900">{new Date(entry.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                                        </div>
                                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Snapshot salvato dopo modifica</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm("Sei sicuro di voler ripristinare questa versione? Tutti i cambiamenti attuali non salvati andranno persi.")) {
                                                                            setSelectedProduct({ ...selectedProduct, ...entry.data });
                                                                            toast.success("Versione ripristinata con successo! Premi 'Esegui Salvataggio' per confermare.");
                                                                        }
                                                                    }}
                                                                    className="px-6 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm flex items-center gap-3"
                                                                >
                                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                                    Ripristina Versione
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Modale - Corporate style */}
                            <div className="p-8 border-t border-gray-200 bg-white flex items-center justify-between z-20">
                                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                    Tutti i cambiamenti sono salvati in tempo reale nel buffer.
                                </div>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="px-8 py-3.5 bg-white border border-gray-200 text-slate-900 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-gray-50 transition-all shadow-sm"
                                    >
                                        Cancella
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="px-10 py-3.5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-black transition-all shadow-xl flex items-center gap-3 disabled:opacity-50"
                                    >
                                        {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                                        Esegui Salvataggio
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* WooCommerce Configuration Modal */}
            <AnimatePresence>
                {
                    showWooConfig && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowWooConfig(false)}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
                            >
                                <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">WooCommerce Settings</h3>
                                        <p className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mt-1">Connessione API REST Store</p>
                                    </div>
                                    <button onClick={() => setShowWooConfig(false)} className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all shadow-sm">
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                <div className="p-10 space-y-8">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Dominio Negozio</label>
                                            <input
                                                type="text"
                                                value={wooConfig.domain}
                                                onChange={e => setWooConfig({ ...wooConfig, domain: e.target.value })}
                                                placeholder="https://tuosito.it"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-slate-200 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Consumer Key</label>
                                            <input
                                                type="password"
                                                value={wooConfig.key}
                                                onChange={e => setWooConfig({ ...wooConfig, key: e.target.value })}
                                                placeholder="ck_################"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-slate-200 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Consumer Secret</label>
                                            <input
                                                type="password"
                                                value={wooConfig.secret}
                                                onChange={e => setWooConfig({ ...wooConfig, secret: e.target.value })}
                                                placeholder="cs_################"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-slate-200 transition-all"
                                            />
                                        </div>
                                    </div>

                                    {wooFields.length > 0 && (
                                        <div className="p-6 bg-green-50 border border-green-100 rounded-3xl">
                                            <p className="text-[10px] font-black text-green-700 uppercase mb-3">Canali WooCommerce Rilevati:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {wooFields.slice(0, 10).map((f: string) => (
                                                    <span key={f} className="text-[9px] font-bold bg-white px-2 py-1 rounded-lg border border-green-200 text-green-600 uppercase italic">{f}</span>
                                                ))}
                                                <span className="text-[9px] font-bold text-green-400">... altri {wooFields.length - 10} campi</span>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={testWooConnection}
                                        disabled={isConnectingWoo}
                                        className="w-full py-5 bg-[#111827] text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isConnectingWoo ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                                        Testa Connessione & Salva
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >
            {/* Bulk Action Bar */}
            <AnimatePresence>
                {
                    selectedIds.length > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-[2.5rem] shadow-2xl z-[100] flex items-center gap-10 border border-white/10 backdrop-blur-xl"
                        >
                            <div className="flex items-center gap-3 pr-10 border-r border-white/10">
                                <span className="bg-slate-900 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black">{selectedIds.length}</span>
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Selezionati</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isBulkDeleting}
                                    className="flex items-center gap-2 text-red-400 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Trash2 className={`w-4 h-4 ${isBulkDeleting ? 'animate-spin' : ''}`} />
                                    {isBulkDeleting ? 'Eliminazione...' : 'Elimina Massa'}
                                </button>
                                <button
                                    onClick={() => toast.info("Funzionalità Sync Woo disponibile a breve.")}
                                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest"
                                >
                                    <RefreshCw className="w-4 h-4" /> Sync Woo
                                </button>
                                <button
                                    onClick={() => setSelectedIds([])}
                                    className="px-6 py-2 bg-white/10 rounded-full text-[10px] font-black uppercase hover:bg-white/20 transition-all"
                                >
                                    Annulla
                                </button>
                            </div>
                        </motion.div>
                    )}
            </AnimatePresence>
        </div>
    );
}

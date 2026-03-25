"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
    Search, Plus, Trash2, Upload, FileText, ImageIcon, Check, MousePointer2, Settings, List, RefreshCw,
    HardDrive, Filter, Download, ExternalLink, Scissors, Wand2, Globe, ScanSearch, Sparkles,
    FolderOpen, ChevronLeft, ChevronRight, Languages, ShoppingCart, Box, ChevronDown,
    LayoutGrid, Package, Edit, X, CheckCircle2, History as HistoryIcon, AlertCircle, Save, Image as ImageIconLucide, Layers,
    Building2, ImagePlus, Link2, ArrowUp, ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import EdgeScroll from "./EdgeScroll";
import { SearchableSelect } from "./SearchableSelect";
import { MultiSearchableSelect } from "./MultiSearchableSelect";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";

const EMPTY_SHEET_FILTERS: Record<string, string> = {
    sku: "",
    ean: "",
    parentSku: "",
    title: "",
    categoryText: "",
    dimensions: "",
    weight: "",
    material: "",
    colore: "",
    description: "",
    docDescription: "",
    seoAiText: "",
    bulletContains: "",
    /** Sottostringa nel nome chiave (es. stagione, cod_fornitore) */
    extraKeyContains: "",
    /** Sottostringa nel valore di un extra (stesso campo se usi anche chiave) */
    extraValueContains: ""
};

/** Etichette filtri per campi scheda (substring, case-insensitive) */
/** Opzioni per modifica massiva valore singolo (allineate a Product + ProductText + ProductPrice + ProductExtra) */
const BULK_SET_FIELD_OPTIONS: { value: string; label: string }[] = [
    { value: "sku", label: "SKU (univoco — attenzione duplicati)" },
    { value: "brand", label: "Brand (testo)" },
    { value: "brandId", label: "Brand ID (FK numerico)" },
    { value: "category", label: "Categoria (testo libero)" },
    { value: "categoryId", label: "Categoria ID (Liv. 1)" },
    { value: "subCategoryId", label: "Sub categoria ID (Liv. 2)" },
    { value: "subSubCategoryId", label: "Sotto-categoria ID (Liv. 3)" },
    { value: "ean", label: "EAN" },
    { value: "parentSku", label: "Parent SKU" },
    { value: "title", label: "Titolo (IT)" },
    { value: "description", label: "Descrizione" },
    { value: "docDescription", label: "Descrizione documentazione (PDF)" },
    { value: "bulletPoints", label: "Bullet points" },
    { value: "seoAiText", label: "SEO AI" },
    { value: "price", label: "Prezzo (listino default)" },
    { value: "currency", label: "Valuta prezzo (listino default)" },
    { value: "dimensions", label: "Dimensioni (extra)" },
    { value: "weight", label: "Peso (extra)" },
    { value: "material", label: "Materiale (extra)" },
    { value: "extra:colore", label: "Colore (extra)" },
    { value: "extra:stockLocal", label: "Giacenza locale (extra)" },
    { value: "extra:stockSupplier", label: "Giacenza fornitore (extra)" },
    { value: "__extra_custom__", label: "Altro campo extra (chiave manuale)" }
];

/** Campi per cui è consentito inviare valore vuoto (azzera / rimuovi extra / default valuta) */
function bulkSetFieldAllowsEmptyValue(fieldPath: string): boolean {
    const fpL = fieldPath.toLowerCase();
    if (fpL.startsWith("extra:")) return true;
    return new Set([
        "categoryid",
        "subcategoryid",
        "subsubcategoryid",
        "brandid",
        "ean",
        "parentsku",
        "brand",
        "category",
        "title",
        "description",
        "docdescription",
        "bulletpoints",
        "seoaitext",
        "currency",
        "dimensions",
        "weight",
        "material"
    ]).has(fpL);
}

function bulkSetFieldValuePlaceholder(fieldPath: string, extraKey: string): string {
    const fp =
        fieldPath === "__extra_custom__"
            ? `extra:${(extraKey || "").trim()}`
            : fieldPath;
    const fpL = fp.toLowerCase();
    if (fpL === "price") return "Es. 19.90 o 0";
    if (fpL === "currency") return "EUR, USD, CHF… (vuoto = EUR)";
    if (fpL === "sku") return "Codice SKU univoco nella società";
    if (["brandid", "categoryid", "subcategoryid", "subsubcategoryid"].includes(fpL)) {
        return "Solo numeri; vuoto = azzera il collegamento";
    }
    if (fpL.startsWith("extra:")) {
        return "Valore; vuoto = rimuove il campo extra se presente";
    }
    return "Testo o numero; vuoto dove consentito azzera il campo";
}

const SHEET_FILTER_FIELDS: { key: string; label: string }[] = [
    { key: "sku", label: "SKU" },
    { key: "ean", label: "EAN" },
    { key: "parentSku", label: "Parent SKU" },
    { key: "title", label: "Titolo (IT)" },
    { key: "categoryText", label: "Categoria (testo)" },
    { key: "dimensions", label: "Dimensioni" },
    { key: "weight", label: "Peso" },
    { key: "material", label: "Materiale" },
    { key: "colore", label: "Colore" },
    { key: "description", label: "Descrizione" },
    { key: "docDescription", label: "Doc. PDF" },
    { key: "seoAiText", label: "SEO AI" },
    { key: "bulletContains", label: "Bullet (contiene)" },
    { key: "extraKeyContains", label: "Extra: nome chiave" },
    { key: "extraValueContains", label: "Extra: valore" }
];

const TITLE_FIELD_PRESETS: { id: string; label: string }[] = [
    { id: "brand", label: "Brand" },
    { id: "category", label: "Categoria" },
    { id: "colore", label: "Colore (extra)" },
    { id: "material", label: "Materiale" },
    { id: "dimensions", label: "Dimensioni" },
    { id: "weight", label: "Peso" },
    { id: "sku", label: "SKU" },
    { id: "ean", label: "EAN" },
    { id: "parentSku", label: "Parent SKU" },
    { id: "price", label: "Prezzo (listino default)" }
];

/** Listino IVA inclusa → imponibile (scorporo) in base all'aliquota % */
function priceNetFromGrossInclVat(gross: string | number | undefined, ratePercent: number | null | undefined): string {
    const g = parseFloat(String(gross ?? "").replace(/[^0-9.,-]/g, "").replace(",", "."));
    if (Number.isNaN(g)) return "—";
    if (ratePercent == null || ratePercent < 0) return "—";
    const r = ratePercent / 100;
    const denom = 1 + r;
    if (denom === 0 || !Number.isFinite(denom)) return "—";
    const net = g / denom;
    if (!Number.isFinite(net)) return "—";
    return net.toFixed(2);
}

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
    const [isBulkWorking, setIsBulkWorking] = useState(false);
    const [pdfSearchResults, setPdfSearchResults] = useState<any[]>([]);
    const [isSearchingPdf, setIsSearchingPdf] = useState(false);
    const [allTags, setAllTags] = useState<any[]>([]);
    const [editLang, setEditLang] = useState<string>("it");
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSuggestingWebTitle, setIsSuggestingWebTitle] = useState(false);
    const [productTranslations, setProductTranslations] = useState<Record<string, any>>({});
    const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
    const [attributeValues, setAttributeValues] = useState<any[]>([]);
    const [isAttributeModalOpen, setIsAttributeModalOpen] = useState(false);
    const [attributeTab, setAttributeTab] = useState<'values' | 'products'>('values');
    const [attrLoading, setAttrLoading] = useState(false);
    const [aiRespectExisting, setAiRespectExisting] = useState(true);
    const [aiUseExistingAsModel, setAiUseExistingAsModel] = useState(true);
    const [showCatalogCropModal, setShowCatalogCropModal] = useState(false);
    const [catalogCropCatalogId, setCatalogCropCatalogId] = useState<number | null>(null);
    const [catalogCropMatches, setCatalogCropMatches] = useState<any[]>([]);
    const [catalogCropStep, setCatalogCropStep] = useState<'catalog' | 'page' | 'crop'>('catalog');
    const [catalogCropPage, setCatalogCropPage] = useState<any | null>(null);
    const [catalogCropImageUrl, setCatalogCropImageUrl] = useState<string | null>(null);
    const [catalogCropBox, setCatalogCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const catalogCropImgRef = useRef<HTMLImageElement | null>(null);
    const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
    const [ambientPrompt, setAmbientPrompt] = useState<string>("");
    const [newExtraKey, setNewExtraKey] = useState("");
    const [newExtraValue, setNewExtraValue] = useState("");


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
    const [brandFilter, setBrandFilter] = useState<string>("");
    const [categoryFilter, setCategoryFilter] = useState<string | number>("all");
    const [subCategoryFilter, setSubCategoryFilter] = useState<string | number>("all");
    const [subSubCategoryFilter, setSubSubCategoryFilter] = useState<string | number>("all");
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [allBrands, setAllBrands] = useState<any[]>([]);
    const [showWooConfig, setShowWooConfig] = useState(false);
    const [wooConfig, setWooConfig] = useState({
        domain: "",
        key: "",
        secret: ""
    });
    const { data: session, status: sessionStatus } = useSession();
    const companyContext = useCompanyContext();
    const effectiveCompanyId =
        (session?.user as any)?.companyId ?? companyContext?.selectedCompanyId ?? null;

    /** Header esplicito per admin globale (evita race con axios.defaults nel primo paint). */
    const companyReq = useMemo(
        () =>
            effectiveCompanyId != null
                ? { headers: { "x-company-id": String(effectiveCompanyId) } }
                : {},
        [effectiveCompanyId]
    );

    const ensureBrandSelected = (): boolean => {
        if (!brandFilter) {
            toast.warning("Seleziona prima un brand.");
            return false;
        }
        return true;
    };

    const wooStorageKey = effectiveCompanyId != null
        ? `pim_woo_config_${effectiveCompanyId}`
        : "pim_woo_config_all";

    const wooMappingStorageKey = effectiveCompanyId != null
        ? `pim_woo_mapping_v1_${effectiveCompanyId}`
        : "pim_woo_mapping_v1_all";
    const [wooFields, setWooFields] = useState<string[]>([]);
    const [isConnectingWoo, setIsConnectingWoo] = useState(false);
    const [isPublishingWoo, setIsPublishingWoo] = useState(false);
    const [isImportingWoo, setIsImportingWoo] = useState(false);
    const [isMassExportingWoo, setIsMassExportingWoo] = useState(false);
    const [isBulkTranslatingTitle, setIsBulkTranslatingTitle] = useState(false);
    const [isExportingSelectedFile, setIsExportingSelectedFile] = useState(false);
    const [showBrandsPanel, setShowBrandsPanel] = useState(false);
    const [selectedBrandForEdit, setSelectedBrandForEdit] = useState<any | null>(null);
    const [brandEditForm, setBrandEditForm] = useState({ aiContentGuidelines: "", producerDomain: "", logoUrl: "" });
    const [brandLogoInputUrl, setBrandLogoInputUrl] = useState("");
    const [isSavingBrand, setIsSavingBrand] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [showBulkSeoModal, setShowBulkSeoModal] = useState(false);
    /** Job di generazione contenuti AI in background (non blocca la UI) */
    const [aiBulkJob, setAiBulkJob] = useState<{
        running: boolean;
        paused: boolean;
        overwriteExisting: boolean;
        total: number;
        done: number;
        errors: number;
        currentProductId?: number;
    } | null>(null);
    const [aiBulkReport, setAiBulkReport] = useState<{
        at: string;
        overwriteExisting: boolean;
        total: number;
        done: number;
        errors: number;
        rows: {
            productId: number;
            sku: string;
            title: string;
            outcome: "ok" | "error";
            message: string;
        }[];
    } | null>(null);
    const [showAiBulkReport, setShowAiBulkReport] = useState(false);
    const aiBulkStopRef = useRef(false);
    const aiBulkQueueRef = useRef<any[]>([]);
    const aiBulkRowsRef = useRef<
        { productId: number; sku: string; title: string; outcome: "ok" | "error"; message: string }[]
    >([]);

    const csvEscapeCell = (val: unknown): string => {
        const s = val == null ? "" : String(val);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const downloadAiBulkReportCsv = (report: NonNullable<typeof aiBulkReport>) => {
        const header = ["product_id", "sku", "title", "outcome", "message"];
        const lines = report.rows.map((r) =>
            [r.productId, r.sku, r.title, r.outcome, r.message].map(csvEscapeCell).join(",")
        );
        const csv = [header.join(","), ...lines].join("\r\n");
        const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ts = report.at.slice(0, 19).replace(/[:.]/g, "-");
        a.href = url;
        a.download = `ai_bulk_report_${ts}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const [showBulkTitleFieldsModal, setShowBulkTitleFieldsModal] = useState(false);
    /** Ordine = ordine nel titolo (primo selezionato per primo, poi si può riordinare) */
    const [bulkTitleFieldsSelected, setBulkTitleFieldsSelected] = useState<string[]>([]);
    const [bulkTitleFieldsPosition, setBulkTitleFieldsPosition] = useState<"start" | "end">("end");
    const [bulkTitleFieldsSeparator, setBulkTitleFieldsSeparator] = useState(" · ");
    /** Chiavi ProductExtra aggiuntive, separate da virgola, in coda alla sequenza */
    const [bulkTitleFieldsCustom, setBulkTitleFieldsCustom] = useState("");

    const [vatCodes, setVatCodes] = useState<
        { id: number; code: string; label: string | null; ratePercent: number }[]
    >([]);
    const [newVatCodeInput, setNewVatCodeInput] = useState("");
    const [newVatRateInput, setNewVatRateInput] = useState("22");
    const [isSavingVatCode, setIsSavingVatCode] = useState(false);

    /** Centro modifiche massive (modale unica) */
    const [showBulkOperationsModal, setShowBulkOperationsModal] = useState(false);
    const [bulkOpFieldPath, setBulkOpFieldPath] = useState("brand");
    const [bulkOpExtraKey, setBulkOpExtraKey] = useState("");
    const [bulkOpValue, setBulkOpValue] = useState("");
    const [bulkOpOnlyEmpty, setBulkOpOnlyEmpty] = useState(true);

    const [showCataloguesPanel, setShowCataloguesPanel] = useState(false);
    const [catalogues, setCatalogues] = useState<any[]>([]);
    const [selectedCatalogueForEdit, setSelectedCatalogueForEdit] = useState<any | null>(null);
    const [catalogueEditForm, setCatalogueEditForm] = useState({
        name: "",
        imageFolderPath: "",
        status: "draft",
        lastListinoName: "",
        pdfs: [] as string[],
        brandId: "" as number | string
    });
    const [isSavingCatalogue, setIsSavingCatalogue] = useState(false);
    const [isCreatingCatalogue, setIsCreatingCatalogue] = useState(false);
    const [isUploadingCatalogPdf, setIsUploadingCatalogPdf] = useState(false);
    const catalogPdfInputRef = useRef<HTMLInputElement>(null);
    const [newCatalogueForm, setNewCatalogueForm] = useState({ name: "", imageFolderPath: "", pdfs: [""], brandId: "" as string | number });
    const [showNewCatalogueForm, setShowNewCatalogueForm] = useState(false);

    // Filtri avanzati Master ERP
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [filterMissingShortDesc, setFilterMissingShortDesc] = useState(false);
    const [filterMissingLongDesc, setFilterMissingLongDesc] = useState(false);
    const [filterMissingImages, setFilterMissingImages] = useState(false);
    const [filterMissingCategory, setFilterMissingCategory] = useState(false);
    const [filterPriceMin, setFilterPriceMin] = useState<string>("");
    const [filterPriceMax, setFilterPriceMax] = useState<string>("");
    const [filterStockMin, setFilterStockMin] = useState<string>("");
    const [filterStockMax, setFilterStockMax] = useState<string>("");

    /** Filtri "contiene" sui singoli campi scheda (substring, case-insensitive) */
    const [sheetFilters, setSheetFilters] = useState<Record<string, string>>(() => ({ ...EMPTY_SHEET_FILTERS }));

    const updateBrandInList = (brandId: number, patch: Record<string, any>) => {
        setAllBrands(prev => prev.map(brand => brand.id === brandId ? { ...brand, ...patch } : brand));
    };

    const fetchCategories = async () => {
        try {
            const res = await axios.get('/api/categories?all=true', companyReq);
            setAllCategories(res.data);
        } catch (err) { }
    };

    const fetchTags = async () => {
        try {
            const res = await axios.get('/api/tags', companyReq);
            setAllTags(res.data);
        } catch (err) { }
    };

    const fetchBrands = async () => {
        try {
            const res = await axios.get('/api/brands', companyReq);
            setAllBrands(Array.isArray(res.data) ? res.data : []);
        } catch (err) { }
    };

    const fetchCatalogues = async () => {
        try {
            const res = await axios.get('/api/catalogues', companyReq);
            setCatalogues(Array.isArray(res.data) ? res.data : []);
        } catch (err) { }
    };

    const fetchVatCodes = async () => {
        try {
            const res = await axios.get("/api/vat-codes", companyReq);
            setVatCodes(Array.isArray(res.data) ? res.data : []);
        } catch {
            setVatCodes([]);
        }
    };

    const handleCreateVatCode = async () => {
        const code = newVatCodeInput.trim().toUpperCase();
        const rate = parseFloat(String(newVatRateInput).replace(",", "."));
        if (!code) {
            toast.warning("Inserisci il codice IVA (es. 22, 10, 0).");
            return;
        }
        if (Number.isNaN(rate) || rate < 0 || rate > 100) {
            toast.warning("Aliquota % deve essere tra 0 e 100.");
            return;
        }
        setIsSavingVatCode(true);
        try {
            const res = await axios.post("/api/vat-codes", { code, ratePercent: rate });
            const row = res.data;
            setVatCodes((prev) =>
                [...prev.filter((x) => x.id !== row.id), row].sort((a, b) => a.code.localeCompare(b.code))
            );
            if (selectedProduct) {
                setSelectedProduct({
                    ...selectedProduct,
                    vatCodeId: row.id,
                    vatCode: {
                        id: row.id,
                        code: row.code,
                        label: row.label ?? null,
                        ratePercent: row.ratePercent,
                    },
                });
            }
            setNewVatCodeInput("");
            toast.success("Codice IVA creato.");
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Errore creazione codice IVA");
        } finally {
            setIsSavingVatCode(false);
        }
    };

    useEffect(() => {
        if (sessionStatus === "loading") return;

        const isGlobalAdmin = Boolean((session?.user as any)?.isGlobalAdmin);
        if (isGlobalAdmin && effectiveCompanyId == null) {
            setLoading(false);
            setAllBrands([]);
            setProducts([]);
            return;
        }

        // Reload Woo config when company changes to avoid cross-company leakage.
        setWooConfig({ domain: "", key: "", secret: "" });
        const saved = localStorage.getItem(wooStorageKey);
        if (saved) setWooConfig(JSON.parse(saved));
        fetchCategories();
        fetchTags();
        fetchBrands();
        fetchCatalogues();
        fetchVatCodes();
        const savedProjectName = localStorage.getItem("pdf_catalog_project_name");
        if (savedProjectName) setProjectName(savedProjectName);
        fetchProducts();
    }, [wooStorageKey, effectiveCompanyId, sessionStatus]);

    const testWooConnection = async () => {
        setIsConnectingWoo(true);
        try {
            const res = await axios.get("/api/integrations/woocommerce", { params: wooConfig });
            setWooFields(res.data.fields || []);
            toast.success(`Connesso! WooCommerce ha ${res.data.totalFound} prodotti.`);
            localStorage.setItem(wooStorageKey, JSON.stringify(wooConfig));
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Connessione fallita");
        } finally {
            setIsConnectingWoo(false);
        }
    };

    const ensureWooMapping = async () => {
        const storageKey = wooMappingStorageKey;
        const saved = localStorage.getItem(storageKey);
        const savedMapping = saved ? (() => {
            try { return JSON.parse(saved); } catch { return null; }
        })() : null;

        // Always read Woo attributes before asking the mapping decision
        let attributeNames: string[] = [];
        let acfMetaKeys: string[] = [];
        try {
            const res = await axios.get("/api/integrations/woocommerce", { params: wooConfig });
            attributeNames = res.data.attributeNames || [];
            acfMetaKeys = res.data.acfMetaKeys || [];
        } catch {
            // ignore, mapping will use defaults
        }

        const defaultPick = (needle: string, fallback: string) => {
            const match = attributeNames.find((n: string) => n.toLowerCase().includes(needle.toLowerCase()));
            if (match) return match;
            return attributeNames.includes(fallback) ? fallback : fallback;
        };

        const draftMapping = {
            brandAttributeName:
                savedMapping?.brandAttributeName ||
                defaultPick("brand", "Brand"),
            materialAttributeName:
                savedMapping?.materialAttributeName ||
                defaultPick("material", "Material"),
            dimensionsAttributeName:
                savedMapping?.dimensionsAttributeName ||
                defaultPick("dimension", "Dimensions"),
            extrasToAttributes: savedMapping?.extrasToAttributes ?? true,
            extrasToERPExtraFields: savedMapping?.extrasToERPExtraFields ?? true,
            stockQuantityERPKey: savedMapping?.stockQuantityERPKey ?? "stockLocal",
            acfMetaPrefix: savedMapping?.acfMetaPrefix ?? "acf_",
            acfToERPExtraFields: savedMapping?.acfToERPExtraFields ?? true,
            acfToWooMeta: savedMapping?.acfToWooMeta ?? true,
        };

        if (savedMapping) {
            const ok = window.confirm("Vuoi usare il mapping WooCommerce salvato (Brand/Material/Dimensions/Stock/ACF)?");
            if (ok) return savedMapping;
        }

        const brandAttr = window.prompt(
            "Nome attributo Woo per BRAND (es. 'Brand'). Lascia vuoto per non usarlo:",
            draftMapping.brandAttributeName
        );
        if (brandAttr === null) return null;

        const materialAttr = window.prompt(
            "Nome attributo Woo per MATERIAL (es. 'Material'). Lascia vuoto per non usarlo:",
            draftMapping.materialAttributeName
        );
        if (materialAttr === null) return null;

        const dimensionsAttr = window.prompt(
            "Nome attributo Woo per DIMENSIONS (es. 'Dimensions'). Lascia vuoto per non usarlo:",
            draftMapping.dimensionsAttributeName
        );
        if (dimensionsAttr === null) return null;

        const extrasConfirm = window.confirm("Mappare tutti gli altri attributi WooCommerce su ERP come 'extraFields'?");

        const stockKey = window.prompt(
            "Dove vuoi salvare Woo stock_quantity in ERP? (scrivi stockLocal o stockSupplier)",
            draftMapping.stockQuantityERPKey
        );
        if (stockKey === null) return null;
        const normalizedStockKey =
            stockKey.toString().trim() === "stockSupplier" ? "stockSupplier" : "stockLocal";

        const acfKeysPreview = acfMetaKeys?.length ? acfMetaKeys.slice(0, 6).join(", ") : "";
        const acfImport = window.confirm(
            "Vuoi importare in ERP (extraFields) i campi ACF di WooCommerce (meta_data con chiave che inizia 'acf_')? " +
                (acfKeysPreview ? `(esempi: ${acfKeysPreview}${acfMetaKeys.length > 6 ? "..." : ""})` : "")
        );
        const acfExport = window.confirm(
            "Quando pubblichi su Woo, vuoi rimandare i campi ACF dai tuoi extraFields ERP verso Woo (meta_data)?"
        );

        const nextMapping = {
            brandAttributeName: brandAttr.trim(),
            materialAttributeName: materialAttr.trim(),
            dimensionsAttributeName: dimensionsAttr.trim(),
            extrasToAttributes: extrasConfirm,
            extrasToERPExtraFields: extrasConfirm,
            stockQuantityERPKey: normalizedStockKey,
            acfMetaPrefix: draftMapping.acfMetaPrefix,
            acfToERPExtraFields: acfImport,
            acfToWooMeta: acfExport,
        };

        localStorage.setItem(storageKey, JSON.stringify(nextMapping));
        return nextMapping;
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
            const mapping = await ensureWooMapping();
            if (!mapping) return;

            const res = await axios.post("/api/integrations/woocommerce", {
                ...wooConfig,
                product,
                mapping
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

    const importFromWoo = async () => {
        if (!ensureBrandSelected()) return;
        if (!wooConfig.domain || !wooConfig.key || !wooConfig.secret) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }

        const mapping = await ensureWooMapping();
        if (!mapping) return;

        const limitRaw = window.prompt("Quanti prodotti importare da WooCommerce? (default 20)", "20");
        if (limitRaw === null) return;
        const limit = parseInt(limitRaw || "20", 10);
        if (!Number.isFinite(limit) || limit <= 0) {
            toast.info("Valore non valido per il limite.");
            return;
        }

        setIsImportingWoo(true);
        const toastId = toast.loading("Importazione prodotti da WooCommerce in corso...");
        try {
            const res = await axios.post("/api/integrations/woocommerce/import", {
                ...wooConfig,
                limit,
                mapping
            });

            const msg =
                `Import completato: ` +
                `${res.data.created || 0} creati, ${res.data.updated || 0} aggiornati, ` +
                `${res.data.skipped || 0} saltati, ${res.data.errors || 0} errori.`;

            toast.update(toastId, {
                render: msg,
                type: "success",
                isLoading: false,
                autoClose: 5000
            });
            fetchProducts();
        } catch (err: any) {
            toast.update(toastId, {
                render: err.response?.data?.error || "Errore durante l'importazione da WooCommerce",
                type: "error",
                isLoading: false,
                autoClose: 5000
            });
        } finally {
            setIsImportingWoo(false);
        }
    };

    const exportSelectedToWoo = async () => {
        if (!ensureBrandSelected()) return;
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }
        const mapping = await ensureWooMapping();
        if (!mapping) return;

        const list = products.filter((p: any) => selectedIds.includes(p.id));
        if (!list.length) return;

        if (!window.confirm(`Push massivo su WooCommerce di ${list.length} prodotti (selezionati)?`)) return;

        setIsMassExportingWoo(true);
        const toastId = toast.loading("Push massivo su WooCommerce in corso...");
        let created = 0;
        let updated = 0;
        let errors = 0;

        try {
            for (const prod of list) {
                try {
                    const res = await axios.post("/api/integrations/woocommerce", {
                        ...wooConfig,
                        product: prod,
                        mapping,
                    });
                    if (res.data.action === "updated") updated++;
                    else created++;
                } catch (err: any) {
                    errors++;
                    console.error("Woo mass export error:", err.response?.data || err.message || err);
                }
            }
        } finally {
            toast.update(toastId, {
                render: `Push massivo completato: ${created} creati, ${updated} aggiornati, ${errors} errori.`,
                type: errors ? "warning" : "success",
                isLoading: false,
                autoClose: 6000,
            });
            setIsMassExportingWoo(false);
            fetchProducts();
        }
    };

    const handleBulkTranslateTitle = async () => {
        if (!ensureBrandSelected()) return;
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }

        const targetLang = editLang;
        const targetLabel = targetLang.toUpperCase();

        if (!window.confirm(`Tradurre il TITOL0 in ${targetLabel} per ${selectedIds.length} prodotti selezionati?`)) return;

        setIsBulkTranslatingTitle(true);
        const toastId = toast.loading(`Traduzione titoli in corso: 0/${selectedIds.length}...`);

        let done = 0;
        let errors = 0;

        try {
            for (const id of selectedIds) {
                const p = products.find((x: any) => x.id === id);
                if (!p) {
                    errors++;
                    done++;
                    continue;
                }

                const sourceLang =
                    targetLang === "it"
                        ? "it"
                        : p?.translations?.["it"]?.title
                        ? "it"
                        : (Object.keys(p.translations || {}).find((l) => p.translations?.[l]?.title) || "it");

                const sourceTitle = (p?.translations?.[sourceLang]?.title || "").toString();

                try {
                    const res = await fetch("/api/ai/translate", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            textData: { title: sourceTitle },
                            targetLanguage: targetLang,
                        }),
                    });

                    if (!res.ok) throw new Error(await res.text());
                    const translated = await res.json();
                    const translatedTitle = translated?.title?.toString?.() ?? "";

                    const existing = p.translations?.[targetLang] || {};

                    await axios.post("/api/products", {
                        sku: p.sku,
                        translations: {
                            [targetLang]: {
                                title: translatedTitle || null,
                                // Preserve other fields in the same language as best-effort
                                description: existing?.description ?? "",
                                bulletPoints: existing?.bulletPoints ?? "",
                                seoAiText: existing?.seoAiText ?? "",
                            },
                        },
                    });
                } catch (e: any) {
                    console.error("Bulk translate title error:", e);
                    errors++;
                } finally {
                    done++;
                    toast.update(toastId, {
                        render: `Traduzione titoli in corso: ${done}/${selectedIds.length}${
                            errors ? ` (${errors} errori)` : ""
                        }`,
                    });
                }
            }
        } finally {
            toast.update(toastId, {
                render: errors
                    ? `Completato con errori: ${done - errors}/${done} aggiornati, ${errors} errori.`
                    : `Completato: ${done}/${done} titoli tradotti in ${targetLabel}.`,
                type: errors ? "warning" : "success",
                isLoading: false,
                autoClose: 6000,
            });
            setIsBulkTranslatingTitle(false);
            fetchProducts();
        }
    };

    const exportSelectedToFile = async (requestedFormat: "excel" | "csv") => {
        if (!ensureBrandSelected()) return;
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }

        const isGlobalAdmin = Boolean((session?.user as any)?.isGlobalAdmin);
        if (isGlobalAdmin && effectiveCompanyId == null) {
            toast.error("Seleziona un'azienda dal menu aziende per esportare.");
            return;
        }

        const picked = requestedFormat;

        setIsExportingSelectedFile(true);
        const toastId = toast.loading(`Esportazione prodotti selezionati (${picked.toUpperCase()})...`);
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (effectiveCompanyId != null) {
                headers["x-company-id"] = String(effectiveCompanyId);
            }

            const res = await fetch("/api/products/export-selected", {
                method: "POST",
                headers,
                credentials: "include",
                body: JSON.stringify({ ids: selectedIds, format: picked }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || "Export fallito");
            }

            const blob = await res.blob();
            const cd = res.headers.get("content-disposition") || "";
            const fileMatch = cd.match(/filename="?([^"]+)"?/i);
            const fileName = fileMatch?.[1] || `products-selected.${picked === "csv" ? "csv" : "xlsx"}`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);

            toast.update(toastId, {
                render: "Export completato!",
                type: "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (err: any) {
            console.error("Export selected error:", err);
            toast.update(toastId, {
                render: err?.message || "Errore export selezionati",
                type: "error",
                isLoading: false,
                autoClose: 5000,
            });
        } finally {
            setIsExportingSelectedFile(false);
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
                        docDescription: aiUseExistingAsModel
                            ? (docDescription?.substring(0, 2000) || "")
                            : "",
                        extraFieldsPreview: extraFields ? Object.entries(extraFields).map(([k, v]) => `${k}: ${v}`).join(", ").substring(0, 1000) : ""
                    },
                    language: "it",
                    options: {
                        respectExisting: aiRespectExisting,
                        useExistingAsModel: aiUseExistingAsModel
                    }
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

                        const existing = tt[editLang];

                        const shouldOverwriteDesc = !aiRespectExisting || !existing?.description;
                        const shouldOverwriteShort = !aiRespectExisting || !existing?.seoAiText;
                        const shouldOverwriteBullets = !aiRespectExisting || !existing?.bulletPoints;

                        tt[editLang] = {
                            ...tt[editLang],
                            seoAiText: shouldOverwriteShort && newShortDescription
                                ? newShortDescription
                                : existing?.seoAiText,
                            description: shouldOverwriteDesc && (newDescription || accumulated.includes('---TECHNICAL_FIELDS---'))
                                ? (newDescription || accumulated.replace('---DESCRIPTION---', '').trim())
                                : existing?.description,
                            bulletPoints: shouldOverwriteBullets && newBullets
                                ? newBullets
                                : existing?.bulletPoints,
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
        if (!ensureBrandSelected()) return;
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

    const handleBulkNormalizeTitles = async () => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;
        if (!confirm(`Normalizzare i titoli di ${selectedIds.length} prodotti?`)) return;
        setIsBulkWorking(true);
        const toastId = toast.loading("Normalizzazione titoli in corso...");
        try {
            await axios.post("/api/products/bulk", { ids: selectedIds, action: "normalize_titles" });
            toast.update(toastId, {
                render: "Titoli normalizzati correttamente",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
            fetchProducts();
        } catch (err) {
            toast.update(toastId, {
                render: "Errore durante la normalizzazione titoli",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const handleBulkAddTitlePrefix = async () => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;
        const prefix = window.prompt("Inserisci il testo da aggiungere davanti al titolo:");
        if (prefix === null) return;
        const clean = prefix.trim();
        if (!clean) {
            toast.info("Nessun prefisso inserito.");
            return;
        }
        setIsBulkWorking(true);
        const toastId = toast.loading("Applicazione prefisso titoli in corso...");
        try {
            await axios.post("/api/products/bulk", {
                ids: selectedIds,
                action: "add_title_prefix",
                prefix: clean
            });
            toast.update(toastId, {
                render: "Prefisso applicato ai titoli selezionati",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
            fetchProducts();
        } catch (err) {
            toast.update(toastId, {
                render: "Errore durante l'applicazione del prefisso",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const handleBulkReplaceTitlePart = async () => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;

        const search = window.prompt('Testo da sostituire nel titolo (es. "IPLEX Design") - opzionale:');
        if (search === null) return;

        const replace = window.prompt('Nuovo testo da usare / assicurare nel titolo (obbligatorio):');
        if (replace === null) return;

        const cleanReplace = replace.trim();
        if (!cleanReplace) {
            toast.info("Nessun testo valido inserito.");
            return;
        }

        const confirmMsg = search && search.trim()
            ? `Sostituire "${search}" con "${cleanReplace}" nei titoli dei ${selectedIds.length} prodotti selezionati e aggiungerlo se non presente?`
            : `Aggiungere "${cleanReplace}" ai titoli dei ${selectedIds.length} prodotti selezionati dove non presente?`;

        if (!window.confirm(confirmMsg)) return;

        setIsBulkWorking(true);
        const toastId = toast.loading("Aggiornamento massivo titoli (Master ERP) in corso...");
        try {
            await axios.post("/api/products/bulk", {
                ids: selectedIds,
                action: "replace_title_part",
                search: search ?? "",
                replace: cleanReplace
            });
            toast.update(toastId, {
                render: "Titoli aggiornati correttamente sui prodotti selezionati",
                type: "success",
                isLoading: false,
                autoClose: 3000
            });
            fetchProducts();
        } catch (err) {
            toast.update(toastId, {
                render: "Errore durante l'aggiornamento massivo dei titoli (Master ERP)",
                type: "error",
                isLoading: false,
                autoClose: 4000
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const handleDeduplicateImagesByBrand = async () => {
        if (isBulkWorking) return;
        if (!brandFilter) {
            toast.info("Seleziona prima un brand dal filtro per eseguire la deduplica.");
            return;
        }

        const targetIds = products
            .filter((p: any) => p.brand === brandFilter)
            .map((p: any) => Number(p.id))
            .filter((id: number) => Number.isInteger(id) && id > 0);

        if (targetIds.length === 0) {
            toast.info("Nessun prodotto trovato per il brand selezionato.");
            return;
        }

        if (
            !window.confirm(
                `Deduplicare i link immagine per il brand "${brandFilter}" su ${targetIds.length} prodotti?`
            )
        ) {
            return;
        }

        setIsBulkWorking(true);
        const toastId = toast.loading("Deduplicazione immagini brand in corso...");
        try {
            const res = await axios.post("/api/products/bulk", {
                action: "dedupe_images",
                ids: targetIds,
                brand: brandFilter,
            });
            toast.update(toastId, {
                render:
                    `Deduplicazione completata (${brandFilter}): ` +
                    String(res.data?.deletedImages ?? 0) +
                    " link duplicati rimossi su " +
                    String(res.data?.productsTouched ?? 0) +
                    " prodotti.",
                type: "success",
                isLoading: false,
                autoClose: 4000,
            });
            fetchProducts();
        } catch (err) {
            console.error("Deduplicate brand images error:", err);
            toast.update(toastId, {
                render: "Errore durante la deduplicazione immagini per brand.",
                type: "error",
                isLoading: false,
                autoClose: 4500,
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const pauseResumeAiBulk = () => {
        setAiBulkJob((prev) => {
            if (!prev) return prev;
            if (!prev.running) return prev;
            return { ...prev, paused: !prev.paused };
        });
    };
    const stopAiBulk = () => {
        aiBulkStopRef.current = true;
        setAiBulkJob((prev) => (prev ? { ...prev, running: false, paused: false } : prev));
        toast.info("Job AI fermato.");
    };

    const toggleBulkTitleField = (id: string) => {
        setBulkTitleFieldsSelected((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const moveBulkTitleField = (index: number, dir: -1 | 1) => {
        setBulkTitleFieldsSelected((prev) => {
            const j = index + dir;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[j]] = [next[j], next[index]];
            return next;
        });
    };

    const handleBulkAppendFieldsToTitle = async () => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;
        const custom = bulkTitleFieldsCustom
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        const fields = [...bulkTitleFieldsSelected, ...custom];
        if (fields.length === 0) {
            toast.info("Seleziona almeno un campo o inserisci chiavi extra (nome campo in ERP).");
            return;
        }
        const sep = bulkTitleFieldsSeparator.trim() || " · ";
        const posLabel = bulkTitleFieldsPosition === "start" ? "all'inizio del titolo" : "in fondo al titolo";
        if (
            !window.confirm(
                `Aggiungere i campi selezionati ${posLabel} per ${selectedIds.length} prodotti (lingua IT)? I valori vuoti vengono saltati.`
            )
        ) {
            return;
        }

        setIsBulkWorking(true);
        setShowBulkTitleFieldsModal(false);
        const toastId = toast.loading("Aggiornamento titoli con campi prodotto...");
        /** Richieste piccole: timeout proxy / PHP / serverless; 10 è il più sicuro. */
        const BULK_TITLE_BATCH = 10;
        const BULK_REQ_TIMEOUT_MS = 120000;
        const totalSel = selectedIds.length;

        const postTitleBatch = async (batchIds: number[]) => {
            const payload = {
                ids: batchIds,
                action: "append_product_fields_to_title",
                fields,
                position: bulkTitleFieldsPosition,
                separator: sep,
                language: "it"
            };
            let lastErr: unknown;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    return await axios.post("/api/products/bulk", payload, {
                        timeout: BULK_REQ_TIMEOUT_MS
                    });
                } catch (e) {
                    lastErr = e;
                    if (attempt < 2) {
                        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
                    }
                }
            }
            throw lastErr;
        };

        try {
            let n = 0;
            let sk = 0;
            let nv = 0;
            for (let i = 0; i < selectedIds.length; i += BULK_TITLE_BATCH) {
                const batch = selectedIds.slice(i, i + BULK_TITLE_BATCH);
                const done = Math.min(i + batch.length, totalSel);
                const batchNum = Math.floor(i / BULK_TITLE_BATCH) + 1;
                const batchTotal = Math.ceil(totalSel / BULK_TITLE_BATCH);
                toast.update(toastId, {
                    render: `Titoli… ${done}/${totalSel} (richiesta ${batchNum}/${batchTotal})`,
                    isLoading: true
                });
                const res = await postTitleBatch(batch);
                n += res.data?.count ?? 0;
                sk += res.data?.skipped ?? 0;
                nv += res.data?.noFieldValues ?? 0;
            }

            let msg: string;
            let toastType: "success" | "warning" = "success";
            if (n === 0) {
                toastType = "warning";
                const bits: string[] = [];
                if (nv > 0) {
                    bits.push(
                        `${nv} senza dati per i campi scelti (vuoti in scheda / chiavi extra errate)`
                    );
                }
                if (sk > 0) {
                    bits.push(`${sk} già con quel blocco nel titolo`);
                }
                msg =
                    bits.length > 0
                        ? `Nessun titolo modificato. ${bits.join(" · ")}`
                        : "Nessun titolo modificato.";
            } else {
                msg =
                    sk > 0 || nv > 0
                        ? `Titoli aggiornati: ${n}${sk ? `, saltati (già presenti): ${sk}` : ""}${nv ? `, senza dati campi: ${nv}` : ""}`
                        : `Titoli aggiornati: ${n}`;
            }
            toast.update(toastId, {
                render: msg,
                type: toastType,
                isLoading: false,
                autoClose: n === 0 ? 7000 : 4000
            });
            fetchProducts();
        } catch (err: any) {
            const apiMsg =
                err?.response?.data?.error ||
                err?.response?.data?.details ||
                err?.message ||
                "Errore di rete o timeout";
            toast.update(toastId, {
                render: `Titoli: ${apiMsg}`,
                type: "error",
                isLoading: false,
                autoClose: 8000
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const BULK_SET_FIELD_BATCH = 40;

    const handleBulkSetFieldMass = async () => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;
        const fp =
            bulkOpFieldPath === "__extra_custom__"
                ? `extra:${bulkOpExtraKey.trim()}`
                : bulkOpFieldPath;
        if (bulkOpFieldPath === "__extra_custom__" && !bulkOpExtraKey.trim()) {
            toast.warning("Indica la chiave del campo extra (es. stagione).");
            return;
        }
        const needsValue =
            fp.toLowerCase() === "price" ||
            fp.toLowerCase() === "sku" ||
            (!bulkSetFieldAllowsEmptyValue(fp) && !fp.toLowerCase().startsWith("extra:"));
        if (needsValue && !bulkOpValue.trim()) {
            toast.warning("Inserisci un valore da applicare.");
            return;
        }
        if (
            !window.confirm(
                `Applicare il valore al campo selezionato su ${selectedIds.length} prodotti${
                    bulkOpOnlyEmpty ? " (solo dove il campo è vuoto)" : ""
                }?`
            )
        ) {
            return;
        }
        setIsBulkWorking(true);
        const toastId = toast.loading("Applicazione valore in corso…");
        try {
            let totU = 0;
            let totS = 0;
            for (let i = 0; i < selectedIds.length; i += BULK_SET_FIELD_BATCH) {
                const batch = selectedIds.slice(i, i + BULK_SET_FIELD_BATCH);
                const res = await axios.post(
                    "/api/products/bulk",
                    {
                        ids: batch,
                        action: "bulk_set_field",
                        fieldPath: fp,
                        value: bulkOpValue,
                        onlyIfEmpty: bulkOpOnlyEmpty
                    },
                    { timeout: 120000 }
                );
                totU += res.data?.updated ?? 0;
                totS += res.data?.skipped ?? 0;
            }
            toast.update(toastId, {
                render: `Aggiornati: ${totU}, saltati (già valorizzati o non validi): ${totS}`,
                type: "success",
                isLoading: false,
                autoClose: 5000
            });
            setShowBulkOperationsModal(false);
            fetchProducts();
        } catch (err: any) {
            toast.update(toastId, {
                render: err?.response?.data?.error || err?.message || "Errore",
                type: "error",
                isLoading: false,
                autoClose: 6000
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const handleBulkGenerateSeoAi = async (overwriteExisting: boolean) => {
        if (!ensureBrandSelected()) return;
        if (selectedIds.length === 0) return;
        setShowBulkOperationsModal(false);
        setShowBulkSeoModal(false);

        const lang = "it";
        const productList = products.filter((p: any) => selectedIds.includes(p.id));
        if (productList.length === 0) {
            toast.info("Nessun prodotto valido selezionato.");
            return;
        }

        aiBulkStopRef.current = false;
        aiBulkQueueRef.current = [...productList];
        aiBulkRowsRef.current = [];
        setAiBulkReport(null);
        setAiBulkJob({
            running: true,
            paused: false,
            overwriteExisting,
            total: productList.length,
            done: 0,
            errors: 0,
        });

        const toastId = "ai-bulk-seo";
        toast.dismiss(toastId);
        toast.info(
            `Generazione SEO AI avviata in background (${productList.length} prodotti). Puoi continuare a usare l'interfaccia.`,
            { toastId, autoClose: 3500 }
        );

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        const parseAiBlocks = (txt: string) => {
            const shortMatch = txt.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
            const descMatch = txt.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
            const bulletMatch = txt.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
            return {
                short: shortMatch ? shortMatch[1].trim() : "",
                desc: descMatch ? descMatch[1].trim() : "",
                bullets: bulletMatch ? bulletMatch[1].trim() : "",
            };
        };

        const runLoop = async () => {
            while (aiBulkQueueRef.current.length > 0) {
                if (aiBulkStopRef.current) break;

                // Pausa cooperativa (non blocca UI)
                if (aiBulkJob?.paused) {
                    await sleep(400);
                    continue;
                }

                const product = aiBulkQueueRef.current.shift();
                if (!product) break;

                // Evita di lavorare sul prodotto attualmente aperto in scheda
                if (selectedProduct?.id && selectedProduct.id === product.id) {
                    aiBulkQueueRef.current.push(product);
                    await sleep(600);
                    continue;
                }

                setAiBulkJob((prev) =>
                    prev
                        ? {
                              ...prev,
                              currentProductId: product.id,
                          }
                        : prev
                );

                try {
                    const { images, extraFields, docDescription, ...cleanProductData } = product;
                    const res = await fetch("/api/ai/describe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            productData: {
                                ...cleanProductData,
                                docDescription: (docDescription?.substring(0, 2000) || ""),
                                extraFieldsPreview: extraFields
                                    ? Object.entries(extraFields)
                                          .map(([k, v]) => `${k}: ${v}`)
                                          .join(", ")
                                          .substring(0, 1000)
                                    : "",
                            },
                            language: lang,
                            options: { respectExisting: !overwriteExisting, useExistingAsModel: true },
                        }),
                    });
                    if (!res.ok) {
                        const t = await res.text().catch(() => "");
                        throw new Error(t || "AI describe failed");
                    }

                    const txt = await res.text();
                    const blocks = parseAiBlocks(txt);
                    const existing = product.translations?.[lang] || {};

                    const payload = {
                        ...product,
                        translations: {
                            ...product.translations,
                            [lang]: {
                                ...existing,
                                seoAiText:
                                    overwriteExisting || !existing.seoAiText
                                        ? blocks.short || existing.seoAiText
                                        : existing.seoAiText,
                                description:
                                    overwriteExisting || !existing.description
                                        ? blocks.desc || existing.description
                                        : existing.description,
                                bulletPoints:
                                    overwriteExisting || !existing.bulletPoints
                                        ? blocks.bullets || existing.bulletPoints
                                        : existing.bulletPoints,
                            },
                        },
                    };

                    await axios.post("/api/products", payload);

                    setAiBulkJob((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  done: prev.done + 1,
                              }
                            : prev
                    );
                    aiBulkRowsRef.current.push({
                        productId: product.id,
                        sku: String(product.sku || ""),
                        title: String(product.title || product.translations?.[lang]?.title || ""),
                        outcome: "ok",
                        message: "",
                    });
                } catch (e) {
                    setAiBulkJob((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  done: prev.done + 1,
                                  errors: prev.errors + 1,
                              }
                            : prev
                    );
                    const anyE = e as any;
                    const msg =
                        anyE?.response?.data?.details ||
                        anyE?.response?.data?.error ||
                        anyE?.message ||
                        "Errore sconosciuto";
                    aiBulkRowsRef.current.push({
                        productId: product.id,
                        sku: String(product.sku || ""),
                        title: String(product.title || product.translations?.[lang]?.title || ""),
                        outcome: "error",
                        message: String(msg).slice(0, 2000),
                    });
                }

                // Yield tra richieste per lasciare la UI reattiva
                await sleep(250);
            }

            setAiBulkJob((prev) => (prev ? { ...prev, running: false, currentProductId: undefined } : prev));
            setAiBulkReport({
                at: new Date().toISOString(),
                overwriteExisting,
                total: productList.length,
                done: productList.length,
                errors: aiBulkRowsRef.current.filter((r) => r.outcome === "error").length,
                rows: aiBulkRowsRef.current,
            });
            // Refresh lista a fine job
            fetchProducts();
        };

        // fire-and-forget
        void runLoop();
    };

    const fetchProducts = async () => {
        if (effectiveCompanyId == null) {
            setLoading(false);
            setProducts([]);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get("/api/products", companyReq);
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
            const payload = {
                ...selectedProduct,
                vatCodeId: selectedProduct.vatCodeId ?? null,
                // The backend only persists category changes when `overwrite.category === true`.
                // Without this, UI updates locally but DB remains unchanged.
                overwrite: { category: true }
            };
            await axios.post("/api/products", payload);
            toast.success("Prodotto aggiornato con successo");
            setSelectedProduct(null);
            fetchProducts(); // refresh table
        } catch (err) {
            toast.error("Errore salvataggio prodotto");
        } finally {
            setIsSaving(false);
        }
    };

    const getExtraValue = (p: any, key: string) => {
        if (!p?.extraFields || typeof p.extraFields !== "object") return "";
        const direct = p.extraFields[key];
        if (direct !== undefined && direct !== null) return String(direct);
        const alias = Object.keys(p.extraFields).find((k) => k.toLowerCase() === key.toLowerCase());
        if (!alias) return "";
        return String(p.extraFields[alias] ?? "");
    };

    const setExtraValue = (p: any, key: string, value: string) => {
        const extras = { ...(p?.extraFields || {}) };
        const alias = Object.keys(extras).find((k) => k.toLowerCase() === key.toLowerCase());
        if (alias && alias !== key) {
            delete extras[alias];
        }
        extras[key] = value;
        return { ...p, extraFields: extras };
    };

    const handleTranslateProduct = async () => {
        if (!selectedProduct) return;

        // Uses IT as source if creating translated versions, but if translating/correcting IT itself, it grabs its own data.
        const sourceLang = editLang === 'it'
            ? 'it'
            : (selectedProduct.translations?.['it']?.title ? 'it' : (Object.keys(selectedProduct.translations || {}).find(l => selectedProduct.translations[l]?.title) || 'it'));

        setIsTranslating(true);
        const toastId = 'translate-erp';
        toast.loading(`Elaborazione AI per ${editLang.toUpperCase()} in corso...`, { toastId });

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

    /** Titolo da SKU/EAN + brand/produttore + risultati web (SerpAPI) + OpenAI */
    const handleSuggestWebTitle = async () => {
        if (!selectedProduct) return;
        if (!selectedProduct.sku?.toString().trim() && !selectedProduct.ean?.toString().trim()) {
            toast.warning("Inserisci almeno SKU o EAN nel prodotto.");
            return;
        }
        setIsSuggestingWebTitle(true);
        const toastId = "suggest-web-title";
        toast.loading("Ricerca web e generazione titolo…", { toastId });
        try {
            const res = await fetch("/api/ai/suggest-product-title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sku: selectedProduct.sku,
                    ean: selectedProduct.ean,
                    brand: selectedProduct.brand,
                    brandId: selectedProduct.brandId ?? null,
                    producerName: selectedProduct.brand,
                    language: editLang,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.details || data?.error || "Errore generazione titolo");
            }
            const title = String(data.title || "").trim();
            if (!title) throw new Error("Titolo vuoto dalla risposta.");

            setSelectedProduct((prev: any) => {
                if (!prev) return null;
                const tt = { ...(prev.translations || {}) };
                if (!tt[editLang]) tt[editLang] = {};
                tt[editLang] = { ...tt[editLang], title };
                return { ...prev, translations: tt };
            });

            toast.dismiss(toastId);
            const n = typeof data.meta?.webHintsLines === "number" ? data.meta.webHintsLines : 0;
            toast.success(
                n > 0
                    ? `Titolo generato (lingua ${editLang.toUpperCase()}, ${n} riferimenti web).`
                    : `Titolo generato (lingua ${editLang.toUpperCase()}). Configura SERPAPI_KEY per la ricerca web.`
            );
        } catch (e: any) {
            toast.dismiss(toastId);
            toast.error(e?.message || "Errore generazione titolo da web");
        } finally {
            setIsSuggestingWebTitle(false);
        }
    };

    const searchWebImages = async (query: string) => {
        if (!query.trim()) return;
        setIsSearchingWeb(true);
        setWebImages([]);
        try {
            // Use catalog search sources when product belongs to a catalogue (improves Deep Asset Search)
            const catalogId = selectedProduct?.catalogId;
            const catalog = catalogId ? catalogues.find((c: any) => c.id === catalogId) : null;
            const sourceUrls = (catalog?.searchSources || [])
                .map((s: any) => (typeof s === 'string' ? s : s?.url).trim())
                .filter(Boolean);
            const sourcesParam = sourceUrls.length > 0 ? `&sources=${encodeURIComponent(sourceUrls.join(','))}` : '';
            const res = await axios.get(`/api/search-images?q=${encodeURIComponent(query)}&shopping=true${sourcesParam}`);
            setWebImages(res.data.images || []);
            if (res.data.images?.length === 0) toast.warning("Nessuna immagine trovata. Prova con SKU diverso o aggiungi SERPAPI_KEY / sorgenti catalogo.");
        } catch (err) {
            toast.error("Errore ricerca immagini sul web");
        }
        setIsSearchingWeb(false);
    };

    const fieldContains = (needle: string, value: unknown) => {
        const n = (needle || "").trim().toLowerCase();
        if (!n) return true;
        return String(value ?? "").toLowerCase().includes(n);
    };

    const filteredProducts = products.filter((p: any) => {
        const term = searchTerm.toLowerCase();

        const matchesBrand = !!brandFilter && p.brand === brandFilter;
        const matchesCategory = categoryFilter === "all" || p.categoryId === Number(categoryFilter);
        const matchesSubCategory = subCategoryFilter === "all" || p.subCategoryId === Number(subCategoryFilter);
        const matchesSubSubCategory = subSubCategoryFilter === "all" || p.subSubCategoryId === Number(subSubCategoryFilter);

        if (!matchesBrand || !matchesCategory || !matchesSubCategory || !matchesSubSubCategory) return false;

        // Filtri avanzati
        if (filterMissingShortDesc) {
            const shortText = (p.seoAiText || p.shortDescription || "").toString().trim();
            if (shortText.length > 0) return false;
        }
        if (filterMissingLongDesc) {
            const longText = (p.description || "").toString().trim();
            if (longText.length > 0) return false;
        }
        if (filterMissingImages) {
            const imgs = p.images || [];
            if (Array.isArray(imgs) && imgs.length > 0) return false;
        }
        if (filterMissingCategory) {
            const categoryText = String(p.category ?? "").trim();
            const categoryIdMissing = p.categoryId == null;
            if (categoryText.length > 0 || !categoryIdMissing) return false;
        }

        // Filtro prezzo da / a
        const priceNum = parseFloat((p.price ?? "0").toString().replace(/[^0-9.,-]/g, "").replace(",", "."));
        if (filterPriceMin) {
            const min = parseFloat(filterPriceMin.replace(",", "."));
            if (!isNaN(min) && !isNaN(priceNum) && priceNum < min) return false;
        }
        if (filterPriceMax) {
            const max = parseFloat(filterPriceMax.replace(",", "."));
            if (!isNaN(max) && !isNaN(priceNum) && priceNum > max) return false;
        }

        // Filtro disponibilità (stock) da / a
        const stockNum = typeof p.stock === "number"
            ? p.stock
            : parseFloat((p.stock ?? "0").toString().replace(/[^0-9.-]/g, ""));
        if (filterStockMin) {
            const minS = parseFloat(filterStockMin.replace(",", "."));
            if (!isNaN(minS) && !isNaN(stockNum) && stockNum < minS) return false;
        }
        if (filterStockMax) {
            const maxS = parseFloat(filterStockMax.replace(",", "."));
            if (!isNaN(maxS) && !isNaN(stockNum) && stockNum > maxS) return false;
        }

        const sf = sheetFilters;
        if (!fieldContains(sf.sku, p.sku)) return false;
        if (!fieldContains(sf.ean, p.ean)) return false;
        if (!fieldContains(sf.parentSku, p.parentSku)) return false;
        if (!fieldContains(sf.title, p.title)) return false;
        if (!fieldContains(sf.categoryText, p.category)) return false;
        if (!fieldContains(sf.dimensions, p.dimensions)) return false;
        if (!fieldContains(sf.weight, p.weight)) return false;
        if (!fieldContains(sf.material, p.material)) return false;
        if (!fieldContains(sf.colore, getExtraValue(p, "colore"))) return false;
        if (!fieldContains(sf.description, p.description)) return false;
        if (!fieldContains(sf.docDescription, p.docDescription)) return false;
        if (!fieldContains(sf.seoAiText, p.seoAiText)) return false;
        if (!fieldContains(sf.bulletContains, p.bulletPoints)) return false;

        const ek = (sf.extraKeyContains || "").trim().toLowerCase();
        const ev = (sf.extraValueContains || "").trim().toLowerCase();
        if (ek || ev) {
            const ex = p.extraFields;
            if (!ex || typeof ex !== "object") return false;
            let extraOk = false;
            for (const [k, v] of Object.entries(ex)) {
                const keyMatch = !ek || k.toLowerCase().includes(ek);
                const valMatch = !ev || String(v ?? "").toLowerCase().includes(ev);
                if (keyMatch && valMatch) {
                    extraOk = true;
                    break;
                }
            }
            if (!extraOk) return false;
        }

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

    const hasSheetFilters = Object.values(sheetFilters).some((v) => (v || "").trim());
    const invertSelectionOnFiltered = () => {
        if (!filteredProducts.length) {
            toast.info("Nessun prodotto nei risultati correnti.");
            return;
        }
        const filteredIds = filteredProducts.map((p: any) => p.id);
        const filteredSet = new Set<number>(filteredIds);
        const currentSet = new Set<number>(selectedIds);

        const nextSet = new Set<number>(selectedIds.filter((id) => !filteredSet.has(id)));
        for (const id of filteredIds) {
            if (!currentSet.has(id)) nextSet.add(id);
        }
        setSelectedIds(Array.from(nextSet));
    };

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
        <div className="flex flex-col h-[calc(100vh-56px)] lg:h-[calc(100vh-80px)] bg-[#F4F5F7] overflow-hidden min-h-0">
            {/* Fixed Main Header Block - responsive */}
            <div className="flex-none p-3 sm:p-5 pb-0 relative z-[60] bg-[#F4F5F7]/95 backdrop-blur-md shadow-sm space-y-3 sm:space-y-4">
                <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Riga titolo + progetto */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="p-1.5 sm:p-2 bg-[#111827] rounded-lg shadow-lg shrink-0">
                                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-xl font-black text-gray-900 tracking-tight leading-none mb-0.5 sm:mb-1 truncate">PIM Master Library</h1>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded-full border truncate max-w-[140px] sm:max-w-none ${projectName === 'Nessun progetto aperto' ? 'bg-red-50 border-red-100 text-red-500 animate-pulse' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                                        PROGETTO: {projectName}
                                    </span>
                                    <span className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-widest hidden sm:inline-flex items-center gap-1">
                                        <span className="w-1 h-1 bg-gray-300 rounded-full" /> Master Records
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-center px-2 py-1 bg-white/80 rounded-lg border border-gray-100">
                                <p className="text-[7px] sm:text-[8px] font-black text-gray-400 uppercase leading-none">DB</p>
                                <p className="text-xs sm:text-sm font-black text-[#111827] leading-tight">
                                    {filteredProducts.length}
                                </p>
                            </div>
                            <div className="flex bg-[#F9FAFB] p-0.5 rounded-lg border border-gray-100">
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white shadow text-[#111827]' : 'text-gray-400'}`}
                                    aria-label="Tabella"
                                >
                                    <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow text-[#111827]' : 'text-gray-400'}`}
                                    aria-label="Griglia"
                                >
                                    <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </button>
                            </div>
                            <button onClick={() => setShowBrandsPanel(true)} className="p-2 sm:p-2.5 bg-white border border-slate-200 rounded-xl shrink-0" aria-label="Brand"><Building2 className="w-4 h-4" /></button>
                            <button onClick={() => { setShowCataloguesPanel(true); setSelectedCatalogueForEdit(null); fetchCatalogues(); }} className="p-2 sm:p-2.5 bg-white border border-slate-200 rounded-xl shrink-0" aria-label="Cataloghi"><Box className="w-4 h-4" /></button>
                            <button onClick={() => setShowWooConfig(true)} className="p-2 sm:p-2.5 bg-[#111827] text-white rounded-xl shrink-0" aria-label="Setup"><Settings className="w-4 h-4" /></button>
                        </div>
                    </div>

                    {/* Ricerca full width su mobile */}
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Cerca SKU, Titolo, Brand..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl pl-9 sm:pl-10 pr-3 py-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                        />
                    </div>

                    {/* Filtri: scroll orizzontale su mobile */}
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 scrollbar-hide min-h-[40px] items-center">
                        <div className="w-[120px] sm:w-[140px] shrink-0">
                            <SearchableSelect
                                options={allBrands.map((brand: any) => ({ value: brand.name, label: brand.name }))}
                                value={brandFilter}
                                onChange={(val) => {
                                    const next = (val as string) || "";
                                    setBrandFilter(next);
                                    setSelectedIds([]);
                                    if (!next) setSelectedProduct(null);
                                }}
                                placeholder="Seleziona brand"
                                showSearch={true}
                            />
                        </div>
                        <div className="w-[130px] sm:w-[160px] shrink-0">
                            <SearchableSelect
                                options={[{ value: 'all', label: 'Categorie' }, ...allCategories.filter((c: any) => !c.parentId).map((c: any) => ({ value: c.id, label: c.name }))]}
                                value={categoryFilter === 'all' ? 'all' : Number(categoryFilter)}
                                onChange={(val) => {
                                    setCategoryFilter(val ?? 'all');
                                    setSubCategoryFilter('all');
                                    setSubSubCategoryFilter('all');
                                }}
                                placeholder="Categoria"
                                showSearch={true}
                            />
                        </div>
                        <div className="w-[120px] sm:w-[160px] shrink-0">
                            <SearchableSelect
                                options={[{ value: 'all', label: 'Sub' }, ...allCategories.filter((c: any) => c.parentId === Number(categoryFilter)).map((c: any) => ({ value: c.id, label: c.name }))]}
                                value={subCategoryFilter === 'all' ? 'all' : Number(subCategoryFilter)}
                                onChange={(val) => { setSubCategoryFilter(val ?? 'all'); setSubSubCategoryFilter('all'); }}
                                placeholder="Sub"
                                showSearch={true}
                                disabled={categoryFilter === 'all'}
                            />
                        </div>
                        <div className="w-[110px] sm:w-[160px] shrink-0">
                            <SearchableSelect
                                options={[{ value: 'all', label: 'Lvl 3' }, ...allCategories.filter((c: any) => c.parentId === Number(subCategoryFilter)).map((c: any) => ({ value: c.id, label: c.name }))]}
                                value={subSubCategoryFilter === 'all' ? 'all' : Number(subSubCategoryFilter)}
                                onChange={(val) => setSubSubCategoryFilter(val ?? 'all')}
                                placeholder="Liv.3"
                                showSearch={true}
                                disabled={subCategoryFilter === 'all'}
                            />
                        </div>

                        {/* Toggle Filtri Avanzati */}
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters((v) => !v)}
                            className={`ml-2 flex items-center gap-1 px-3 py-2 rounded-xl bg-white border text-[9px] font-black uppercase tracking-widest shrink-0 hover:bg-slate-50 ${
                                hasSheetFilters
                                    ? "border-violet-400 text-violet-700 ring-1 ring-violet-200"
                                    : "border-slate-200 text-slate-500"
                            }`}
                        >
                            <span>Filtri avanzati{hasSheetFilters ? " ●" : ""}</span>
                            <ChevronDown
                                className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </div>

                    {/* Sezione Filtri Avanzati a scomparsa */}
                    {showAdvancedFilters && (
                        <div className="mt-2 px-1 py-2 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap gap-3 items-center text-[11px]">
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                    checked={filterMissingShortDesc}
                                    onChange={(e) => setFilterMissingShortDesc(e.target.checked)}
                                />
                                <span className="font-bold text-slate-700">Senza descrizione breve</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                    checked={filterMissingLongDesc}
                                    onChange={(e) => setFilterMissingLongDesc(e.target.checked)}
                                />
                                <span className="font-bold text-slate-700">Senza descrizione lunga</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                    checked={filterMissingImages}
                                    onChange={(e) => setFilterMissingImages(e.target.checked)}
                                />
                                <span className="font-bold text-slate-700">Senza immagini</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                    checked={filterMissingCategory}
                                    onChange={(e) => setFilterMissingCategory(e.target.checked)}
                                />
                                <span className="font-bold text-slate-700">Senza categoria</span>
                            </label>

                            <div className="flex items-center gap-2 ml-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prezzo €</span>
                                <input
                                    type="number"
                                    placeholder="da"
                                    value={filterPriceMin}
                                    onChange={(e) => setFilterPriceMin(e.target.value)}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                                />
                                <span className="text-[10px] font-black text-slate-400">-</span>
                                <input
                                    type="number"
                                    placeholder="a"
                                    value={filterPriceMax}
                                    onChange={(e) => setFilterPriceMax(e.target.value)}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Disponibilità</span>
                                <input
                                    type="number"
                                    placeholder="da"
                                    value={filterStockMin}
                                    onChange={(e) => setFilterStockMin(e.target.value)}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                                />
                                <span className="text-[10px] font-black text-slate-400">-</span>
                                <input
                                    type="number"
                                    placeholder="a"
                                    value={filterStockMax}
                                    onChange={(e) => setFilterStockMax(e.target.value)}
                                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800"
                                />
                            </div>

                            <div className="w-full border-t border-slate-200 pt-3 mt-1">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Campi scheda prodotto (contiene)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSheetFilters({ ...EMPTY_SHEET_FILTERS })}
                                        disabled={!Object.values(sheetFilters).some((v) => (v || "").trim())}
                                        className="text-[10px] font-black uppercase text-violet-600 hover:text-violet-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Azzera campi scheda
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                                    {SHEET_FILTER_FIELDS.map(({ key, label }) => (
                                        <label key={key} className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[9px] font-black uppercase text-slate-400 truncate" title={label}>
                                                {label}
                                            </span>
                                            <input
                                                type="text"
                                                value={sheetFilters[key] ?? ""}
                                                onChange={(e) =>
                                                    setSheetFilters((prev) => ({ ...prev, [key]: e.target.value }))
                                                }
                                                className="w-full min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-800 placeholder:text-slate-300"
                                                placeholder="Filtra…"
                                            />
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2 leading-snug">
                                    <span className="font-black text-slate-600">Campi extra (dinamici):</span> solo{" "}
                                    <em>valore</em> = in qualsiasi extra; solo <em>nome chiave</em> = almeno una chiave
                                    che contiene il testo; <em>entrambi</em> = stesso campo extra deve soddisfare
                                    chiave e valore.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Azioni massivo WooCommerce sotto i filtri */}
                <div className="px-1 sm:px-0 mt-3 flex flex-wrap gap-3 items-center">
                    <button
                        onClick={importFromWoo}
                        disabled={
                            isImportingWoo ||
                            !brandFilter ||
                            !wooConfig.domain ||
                            !wooConfig.key ||
                            !wooConfig.secret
                        }
                        className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                    >
                        {isImportingWoo ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Import WooCommerce"}
                    </button>

                    <button
                        onClick={exportSelectedToWoo}
                        disabled={
                            isMassExportingWoo ||
                            !brandFilter ||
                            selectedIds.length === 0 ||
                            !wooConfig.domain ||
                            !wooConfig.key
                        }
                        className="px-4 py-2 bg-[#111827] text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-black transition-all border border-[#111827] disabled:opacity-50"
                    >
                        {isMassExportingWoo ? (
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            `Push massivo (${selectedIds.length})`
                        )}
                    </button>

                    <button
                        onClick={handleBulkTranslateTitle}
                        disabled={isBulkTranslatingTitle || selectedIds.length === 0 || !brandFilter}
                        className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                    >
                        {isBulkTranslatingTitle ? (
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            `Traduci titolo (${editLang.toUpperCase()})`
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => void exportSelectedToFile("excel")}
                        disabled={isExportingSelectedFile || selectedIds.length === 0 || !brandFilter}
                        className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                    >
                        {isExportingSelectedFile ? (
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            "Esporta Excel"
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => void exportSelectedToFile("csv")}
                        disabled={isExportingSelectedFile || selectedIds.length === 0 || !brandFilter}
                        className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                    >
                        {isExportingSelectedFile ? (
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            "Esporta CSV"
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={handleDeduplicateImagesByBrand}
                        disabled={isBulkWorking || !brandFilter}
                        className="px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                        title={
                            !brandFilter
                                ? "Seleziona un brand dal filtro per deduplicare"
                                : `Rimuove link immagine duplicati per ${brandFilter}`
                        }
                    >
                        {isBulkWorking ? (
                            <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            "Deduplica immagini brand"
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (!ensureBrandSelected()) return;
                            if (!selectedIds.length) {
                                toast.warning("Seleziona almeno un prodotto in tabella.");
                                return;
                            }
                            setShowBulkOperationsModal(true);
                        }}
                        disabled={selectedIds.length === 0 || !brandFilter}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-black transition-all border border-slate-900 disabled:opacity-40"
                    >
                        <Layers className="w-4 h-4 shrink-0" />
                        Modifiche massive
                    </button>
                    <button
                        type="button"
                        onClick={invertSelectionOnFiltered}
                        disabled={filteredProducts.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-40"
                        title="Inverte la selezione sui risultati correnti (es. filtro ricerca titolo)"
                    >
                        Selezione inversa
                    </button>
                </div>

                {/* Status bar - compatto su mobile */}
                <div className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white/40 backdrop-blur-xl border border-gray-200/60 rounded-t-2xl flex items-center shadow-sm -mb-[1px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse shrink-0" />
                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-500 truncate ml-2">PIM Inventory Engine</span>
                </div>
            </div>

            {/* Dedicated Scrollable Table Area */}
            <div className="flex-1 overflow-y-auto px-2 sm:px-5 pb-5 custom-scrollbar w-full">
                <div className="bg-white shadow-sm border border-gray-200/60 rounded-b-2xl min-h-full overflow-hidden">
                    <EdgeScroll className="overflow-x-auto max-w-full w-full">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            {/* Flawlessly docked column headers that stick to 0 of their scroll container */}
                            <thead
                                className="bg-[#F9FAFB] border-b border-gray-200 text-slate-400 sticky top-0 z-[55] shadow-sm transform-gpu"
                            >
                                <tr>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 w-8">
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
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Asset</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">SKU</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Denominazione</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest hidden md:table-cell">Brand</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest hidden lg:table-cell">Categoria</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Prezzo</th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-right">Azioni</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-8 py-12 text-center">
                                            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" />
                                            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Caricamento Libreria...</p>
                                        </td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-8 py-12 text-center">
                                            <Box className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nessun prodotto trovato</p>
                                        </td>
                                    </tr>
                                ) : filteredProducts.map((p: any) => (
                                    <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors group ${selectedIds.includes(p.id) ? 'bg-slate-50/80' : ''}`}>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5">
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
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                                                <CorporateImage src={p.images && p.images[0]?.url} alt={p.sku} className="w-full h-full object-contain" />
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5">
                                            <span className="font-mono text-[10px] sm:text-[11px] font-black text-slate-700 bg-gray-100/80 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-gray-200/50">{p.sku}</span>
                                            {p.ean && (
                                                <div className="mt-0.5 sm:mt-1 text-[7px] sm:text-[8px] font-bold text-gray-300 tracking-wider">EAN: {p.ean}</div>
                                            )}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 min-w-[140px]">
                                            <button
                                                onClick={() => setSelectedProduct(p)}
                                                className="font-bold text-[11px] sm:text-[13px] text-gray-900 hover:text-slate-600 transition-colors text-left block leading-tight mb-0.5 sm:mb-1 line-clamp-2 sm:line-clamp-none"
                                            >
                                                {p.title || "Prodotto Senza Titolo"}
                                            </button>
                                            <div className="text-[8px] sm:text-[9px] font-medium text-gray-400 line-clamp-1 max-w-[180px] sm:max-w-md italic">
                                                {p.seoAiText
                                                    ? (p.seoAiText.length > 100 ? `${p.seoAiText.substring(0, 100)}…` : p.seoAiText)
                                                    : p.description}
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-bold text-slate-700 hidden md:table-cell">{p.brand || "—"}</td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">{p.category || "—"}</td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 font-black text-[10px] sm:text-xs text-[#111827] whitespace-nowrap">€ {parseFloat(p.price || "0").toLocaleString()}</td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-right">
                                            <button
                                                onClick={() => setSelectedProduct(p)}
                                                className="p-1.5 sm:p-2 text-gray-400 hover:text-slate-900 hover:bg-gray-100 rounded-lg transition-all touch-manipulation"
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
                            <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-200 flex items-start sm:items-center justify-between bg-white z-20 gap-2 sm:gap-4 relative">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 pr-10 sm:pr-0">
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
                                <div className="absolute top-4 right-4 sm:relative sm:top-0 sm:right-0 flex items-center gap-3 shrink-0">
                                    <div className="hidden sm:flex items-center gap-2 mr-4">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">PIM EDITOR V3.1</span>
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
                            <div className="px-4 sm:px-8 bg-white border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-2 overflow-hidden">
                                <div className="flex overflow-x-auto no-scrollbar w-full md:w-auto">
                                    <TabButton id="info" label="Generale" icon={Package} />
                                    <TabButton id="images" label="Media & Asset" icon={LayoutGrid} />
                                    <TabButton id="seo" label="SEO & AI Content" icon={Sparkles} />
                                    <TabButton id="attributes" label="Specifiche & Bullet" icon={List} />
                                    <TabButton id="woocommerce" label="Omnichannel" icon={Globe} />
                                    <TabButton id="history" label="Cronologia" icon={HistoryIcon} />
                                </div>
                                <div className="flex items-center gap-4 pb-2 md:pb-0 overflow-x-auto shrink-0 w-full md:w-auto">
                                    <div className="flex shrink-0 bg-gray-50 p-1 rounded-xl border border-gray-200">
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
                                    <button
                                        onClick={handleTranslateProduct}
                                        disabled={isTranslating}
                                        className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isTranslating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                                        Traduci / Correggi AI
                                    </button>
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
                                                        <div className="flex justify-between items-center mb-2 gap-2 flex-wrap">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1">Titolo Prodotto ({editLang})</label>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleSuggestWebTitle()}
                                                                    disabled={isSuggestingWebTitle}
                                                                    title="Usa SKU, EAN, brand e risultati web (SerpAPI se configurato) per proporre un titolo con AI."
                                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-violet-50 text-violet-800 border border-violet-100 hover:bg-violet-100 disabled:opacity-50"
                                                                >
                                                                    {isSuggestingWebTitle ? (
                                                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                                                    ) : (
                                                                        <Globe className="w-3 h-3" />
                                                                    )}
                                                                    Titolo da web
                                                                </button>
                                                                <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase">PIM Global Name</span>
                                                            </div>
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
                                                <p className="text-[11px] text-slate-500 font-bold -mt-2">
                                                    Il prezzo listino è considerato <span className="text-slate-700">IVA inclusa</span>. Il netto viene calcolato in automatico (scorporo) in base al codice IVA.
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">
                                                            Prezzo listino (IVA inclusa) (€)
                                                        </label>
                                                        <input
                                                            value={selectedProduct.price || ""}
                                                            onChange={e => setSelectedProduct({ ...selectedProduct, price: e.target.value })}
                                                            className="w-full bg-orange-50/20 border border-orange-100 rounded-xl px-4 py-3 font-black text-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-50 transition-all text-lg"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">
                                                            Prezzo IVA esclusa (€)
                                                        </label>
                                                        <input
                                                            readOnly
                                                            value={priceNetFromGrossInclVat(
                                                                selectedProduct.price,
                                                                selectedProduct.vatCode?.ratePercent ??
                                                                    vatCodes.find((v) => v.id === selectedProduct.vatCodeId)?.ratePercent
                                                            )}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-black text-slate-800 text-lg cursor-not-allowed"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">
                                                            Codice IVA
                                                        </label>
                                                        <select
                                                            value={selectedProduct.vatCodeId ?? ""}
                                                            onChange={(e) => {
                                                                const raw = e.target.value;
                                                                const id = raw === "" ? null : Number(raw);
                                                                const row = id != null ? vatCodes.find((v) => v.id === id) : null;
                                                                setSelectedProduct({
                                                                    ...selectedProduct,
                                                                    vatCodeId: id,
                                                                    vatCode: row
                                                                        ? {
                                                                              id: row.id,
                                                                              code: row.code,
                                                                              label: row.label,
                                                                              ratePercent: row.ratePercent,
                                                                          }
                                                                        : null,
                                                                });
                                                            }}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-900 focus:outline-none text-sm"
                                                        >
                                                            <option value="">— Nessun codice IVA —</option>
                                                            {vatCodes.map((v) => (
                                                                <option key={v.id} value={v.id}>
                                                                    {v.code}
                                                                    {v.label ? ` — ${v.label}` : ""} ({v.ratePercent}%)
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 space-y-3">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                            Nuovo codice IVA (tabella aziendale)
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 items-end">
                                                            <div className="flex-1 min-w-[120px]">
                                                                <label className="text-[9px] font-bold text-slate-400 block mb-1">Codice</label>
                                                                <input
                                                                    value={newVatCodeInput}
                                                                    onChange={(e) => setNewVatCodeInput(e.target.value)}
                                                                    placeholder="es. 22"
                                                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold uppercase"
                                                                />
                                                            </div>
                                                            <div className="w-28">
                                                                <label className="text-[9px] font-bold text-slate-400 block mb-1">Aliquota %</label>
                                                                <input
                                                                    value={newVatRateInput}
                                                                    onChange={(e) => setNewVatRateInput(e.target.value)}
                                                                    placeholder="22"
                                                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black"
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleCreateVatCode()}
                                                                disabled={isSavingVatCode}
                                                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black disabled:opacity-50"
                                                            >
                                                                {isSavingVatCode ? "…" : "Aggiungi"}
                                                            </button>
                                                        </div>
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
                                            <div className="mb-4 flex flex-wrap gap-2 items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowCatalogCropModal(true); setCatalogCropStep('catalog'); setCatalogCropCatalogId(null); setCatalogCropMatches([]); setCatalogCropPage(null); setCatalogCropImageUrl(null); setCatalogCropBox(null); }}
                                                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 flex items-center gap-2"
                                                >
                                                    <Scissors className="w-4 h-4" />
                                                    Seleziona da catalogo (crop)
                                                </button>
                                                <input
                                                    type="text"
                                                    value={ambientPrompt}
                                                    onChange={e => setAmbientPrompt(e.target.value)}
                                                    placeholder="Es. cucina, tavola apparecchiata, bagno..."
                                                    className="flex-1 min-w-[160px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (!selectedProduct?.id) return;
                                                        const toastId = toast.loading("Generazione foto ambientata AI in corso...");
                                                        try {
                                                        const res = await axios.post(`/api/products/${selectedProduct.id}/ambient-image`, {
                                                            prompt: ambientPrompt || undefined,
                                                        });
                                                            const img = res.data?.image;
                                                            if (img?.url) {
                                                                const newImages = [...(selectedProduct.images || []), { id: img.id, url: img.url }];
                                                                setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                toast.update(toastId, {
                                                                    render: "Foto ambientata generata e aggiunta.",
                                                                    type: "success",
                                                                    isLoading: false,
                                                                    autoClose: 3000,
                                                                });
                                                            } else {
                                                                toast.update(toastId, {
                                                                    render: "Generazione completata ma nessuna immagine restituita.",
                                                                    type: "warning",
                                                                    isLoading: false,
                                                                    autoClose: 4000,
                                                                });
                                                            }
                                                        } catch (err: any) {
                                                            toast.update(toastId, {
                                                                render: err?.response?.data?.error || "Errore durante la generazione della foto ambientata.",
                                                                type: "error",
                                                                isLoading: false,
                                                                autoClose: 4000,
                                                            });
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 flex items-center gap-2"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                    Foto ambientata AI
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                                                    selectedProduct.images.map((img: any, i: number) => (
                                                        <div
                                                            key={img.id || i}
                                                            className="group relative aspect-square rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 shadow-sm hover:border-blue-300 transition-all cursor-zoom-in"
                                                            onClick={() => setZoomImageUrl(img.url)}
                                                        >
                                                            <CorporateImage src={img.url} alt={selectedProduct.sku} className="w-full h-full object-contain p-2" />
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const newImages = selectedProduct.images.filter((_: any, idx: number) => idx !== i);
                                                                    setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                }}
                                                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 border border-slate-200 text-slate-500 hover:bg-red-500 hover:text-white hover:border-red-500 flex items-center justify-center text-[10px] font-black shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                                title="Rimuovi immagine"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
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

                                        {/* Preview contenuti AI (breve+lungo) direttamente nella tab Media & Asset */}
                                        <div className="bg-white p-8 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-700 flex items-center gap-2">
                                                    <Sparkles className="w-3.5 h-3.5" /> Anteprima Contenuti AI ({editLang})
                                                </h4>
                                            </div>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Breve / SEO</p>
                                                    <p className="text-[11px] text-slate-700 leading-snug line-clamp-3">
                                                        {selectedProduct.translations?.[editLang]?.seoAiText || "Nessun contenuto AI generato per questo prodotto."}
                                                    </p>
                                                </div>
                                                <div className="border-t border-slate-100 pt-3">
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Descrizione lunga</p>
                                                    <p className="text-[11px] text-slate-600 leading-snug line-clamp-4">
                                                        {selectedProduct.translations?.[editLang]?.description || "La descrizione lunga AI apparirà qui dopo la generazione."}
                                                    </p>
                                                </div>
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
                                                    onClick={() => searchWebImages(`${selectedProduct.brand || ''} ${selectedProduct.sku || ''} ${selectedProduct.ean || ''}`.trim() || selectedProduct.title)}
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
                                                        {webImages.map((wImg: any, idx: number) => {
                                                            const url = typeof wImg === 'string' ? wImg : wImg.url;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="relative aspect-square w-28 h-28 shrink-0 rounded-2xl overflow-hidden border border-gray-100 group bg-gray-50 cursor-zoom-in hover:border-slate-900 shadow-sm"
                                                                    onClick={() => setZoomImageUrl(url)}
                                                                >
                                                                    <CorporateImage src={url} alt="Web Match" className="w-full h-full object-contain p-2" />
                                                                    <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={async (e) => {
                                                                                e.stopPropagation();
                                                                                const toastId = toast.loading("Salvataggio locale...");
                                                                                const localUrl = await saveImageToServer(url, selectedProduct.sku);
                                                                                const newImages = [...(selectedProduct.images || []), { id: Date.now().toString(), url: localUrl }];
                                                                                setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                                toast.update(toastId, { render: "Risorsa accodata.", type: "success", isLoading: false, autoClose: 2000 });
                                                                            }}
                                                                            className="p-2 bg-slate-900 text-white rounded-full scale-50 group-hover:scale-100 transition-all shadow-lg"
                                                                        >
                                                                            <Plus className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                    {(wImg.productData || wImg.source?.includes('Shop')) && (
                                                                        <div className="absolute top-0 right-0 bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-bl-lg flex items-center gap-1">
                                                                            <ShoppingCart className="w-2.5 h-2.5" />
                                                                            SHOPPING
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
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
                                                            const currentBullets = currentBulletStr.split('\n').filter((line: string) => line.trim() !== "");
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
                                                    {(selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((line: string) => line.trim() !== "").map((bullet: string, idx: number) => {
                                                        const isKeyValue = bullet.includes(':');
                                                        const [title, value] = isKeyValue ? bullet.replace(/^-\s*/, '').split(':').map(s => s.trim()) : ['', bullet.replace(/^-\s*/, '')];

                                                        return (
                                                            <div key={idx} className="flex gap-3 items-center group bg-slate-50/50 p-2 rounded-2xl border border-transparent hover:border-slate-200 transition-all">
                                                                <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-black shrink-0 text-[10px] shadow-lg shadow-slate-200">{idx + 1}</div>

                                                                {isKeyValue ? (
                                                                    <div className="flex-1 flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setSelectedAttributeKey(title);
                                                                                setIsAttributeModalOpen(true);
                                                                            }}
                                                                            className="text-[11px] font-black uppercase text-emerald-600 hover:text-emerald-700 underline decoration-dotted"
                                                                        >
                                                                            {title}
                                                                        </button>
                                                                        <div className="text-slate-300 font-black">→</div>
                                                                        <input
                                                                            value={value}
                                                                            onChange={e => {
                                                                                const val = e.target.value;
                                                                                const arr = (selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((line: string) => line.trim() !== "");
                                                                                arr[idx] = `- ${title}: ${val}`;
                                                                                const tt = { ...selectedProduct.translations };
                                                                                if (!tt[editLang]) tt[editLang] = {};
                                                                                tt[editLang].bulletPoints = arr.join('\n');
                                                                                setSelectedProduct({ ...selectedProduct, translations: tt });
                                                                            }}
                                                                            className="flex-1 text-sm font-bold text-gray-800 outline-none"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <input
                                                                        value={value}
                                                                        onChange={e => {
                                                                            const val = e.target.value;
                                                                            const arr = (selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((line: string) => line.trim() !== "");
                                                                            arr[idx] = val ? `- ${val}` : "";
                                                                            const tt = { ...selectedProduct.translations };
                                                                            if (!tt[editLang]) tt[editLang] = {};
                                                                            tt[editLang].bulletPoints = arr.join('\n');
                                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                                        }}
                                                                        className="w-full px-4 py-3 bg-white border border-slate-100 focus:border-emerald-300 rounded-xl text-sm font-bold text-gray-800 transition-all outline-none shadow-sm"
                                                                        placeholder={`Inserisci bullet ${idx + 1}...`}
                                                                    />
                                                                )}

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const arr = (selectedProduct.translations?.[editLang]?.bulletPoints || "").split('\n').filter((line: string) => line.trim() !== "");
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
                                                        );
                                                    })}
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

                                            <div className="mt-10 pt-8 border-t border-gray-100">
                                                <div className="flex items-center gap-3 mb-8">
                                                    <div className="p-2 bg-emerald-50 rounded-lg">
                                                        <Sparkles className="w-4 h-4 text-emerald-600" />
                                                    </div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Campi Extra (allineati a Import LAB)</p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1 block">COLORE</label>
                                                        <input
                                                            value={getExtraValue(selectedProduct, "colore")}
                                                            onChange={e => setSelectedProduct(setExtraValue(selectedProduct, "colore", e.target.value))}
                                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 focus:outline-none focus:border-emerald-400 transition-all text-xs shadow-sm"
                                                            placeholder="Es. Rosso, Nero opaco, Multicolor..."
                                                        />
                                                    </div>
                                                </div>

                                                {selectedProduct.extraFields && Object.keys(selectedProduct.extraFields).length > 0 && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                        {Object.entries(selectedProduct.extraFields)
                                                            .filter(([key]) => key.toLowerCase() !== "colore")
                                                            .map(([key, value]: [string, any]) => (
                                                                <div key={key} className="space-y-2">
                                                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1 block">{key}</label>
                                                                    <input
                                                                        value={String(value)}
                                                                        onChange={e => {
                                                                            const newExtras = { ...(selectedProduct.extraFields || {}), [key]: e.target.value };
                                                                            setSelectedProduct({ ...selectedProduct, extraFields: newExtras });
                                                                        }}
                                                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold text-gray-800 focus:outline-none focus:border-emerald-400 transition-all text-xs shadow-sm"
                                                                    />
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}

                                                <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                                                    <input
                                                        value={newExtraKey}
                                                        onChange={(e) => setNewExtraKey(e.target.value)}
                                                        placeholder="Nome campo extra (es. STAGIONE)"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700"
                                                    />
                                                    <input
                                                        value={newExtraValue}
                                                        onChange={(e) => setNewExtraValue(e.target.value)}
                                                        placeholder="Valore"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const k = newExtraKey.trim();
                                                            if (!k || !selectedProduct) return;
                                                            const next = { ...(selectedProduct.extraFields || {}), [k]: newExtraValue };
                                                            setSelectedProduct({ ...selectedProduct, extraFields: next });
                                                            setNewExtraKey("");
                                                            setNewExtraValue("");
                                                        }}
                                                        className="px-4 py-3 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
                                                    >
                                                        Aggiungi campo
                                                    </button>
                                                </div>
                                            </div>
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

                                            {/* Mass actions ora sono sotto i filtri */}
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
            </AnimatePresence>

            {/* Brands Panel Modal */}
            <AnimatePresence>
                {showBrandsPanel && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setShowBrandsPanel(false); setSelectedBrandForEdit(null); }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={e => e.stopPropagation()}
                            className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                                        {selectedBrandForEdit ? `Impostazioni: ${selectedBrandForEdit.name}` : "Gestione Brand"}
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                        {selectedBrandForEdit ? "Tono AI, logo e dominio produttore" : "Logo, numero prodotti e impostazioni per brand"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setShowBrandsPanel(false); setSelectedBrandForEdit(null); }}
                                    className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all shadow-sm"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                {!selectedBrandForEdit ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {allBrands.map((brand: any) => (
                                            <div
                                                key={brand.id}
                                                className="bg-gray-50 border border-gray-100 rounded-2xl p-5 flex items-center gap-4 hover:border-slate-200 transition-all"
                                            >
                                                <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                                    {brand.logoUrl ? (
                                                        <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" />
                                                    ) : (
                                                        <Building2 className="w-7 h-7 text-gray-300" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-black text-gray-900 truncate">{brand.name}</p>
                                                    <p className="text-[11px] font-bold text-gray-500 mt-0.5">
                                                        {brand.productCount ?? 0} prodotti
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setSelectedBrandForEdit(brand);
                                                        setBrandEditForm({
                                                            aiContentGuidelines: brand.aiContentGuidelines || "",
                                                            producerDomain: brand.producerDomain || "",
                                                            logoUrl: brand.logoUrl || ""
                                                        });
                                                        setBrandLogoInputUrl("");
                                                    }}
                                                    className="p-2.5 bg-[#111827] text-white rounded-xl hover:bg-black transition-all shrink-0"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {allBrands.length === 0 && (
                                            <p className="col-span-2 text-center text-gray-400 text-sm py-8">Nessun brand. Aggiungi brand dalla tabella Brands.</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Logo brand</label>
                                            <div className="flex flex-col sm:flex-row gap-4 items-start">
                                                <div className="w-24 h-24 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                                    {brandEditForm.logoUrl ? (
                                                        <img src={brandEditForm.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                                    ) : (
                                                        <ImagePlus className="w-10 h-10 text-gray-300" />
                                                    )}
                                                </div>
                                                <div className="flex-1 w-full space-y-2">
                                                    <input
                                                        type="url"
                                                        value={brandLogoInputUrl}
                                                        onChange={e => setBrandLogoInputUrl(e.target.value)}
                                                        placeholder="https://esempio.com/logo.png"
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={!brandLogoInputUrl.trim() || isUploadingLogo}
                                                        onClick={async () => {
                                                            if (!brandLogoInputUrl.trim() || !selectedBrandForEdit) return;
                                                            setIsUploadingLogo(true);
                                                            try {
                                                                const res = await axios.post("/api/brands/upload-logo", {
                                                                    imageUrl: brandLogoInputUrl.trim(),
                                                                    brandId: selectedBrandForEdit.id
                                                                });
                                                                const localUrl = res.data.localUrl;
                                                                setBrandEditForm(prev => ({ ...prev, logoUrl: localUrl }));
                                                                setBrandLogoInputUrl("");
                                                                await axios.put(`/api/brands/${selectedBrandForEdit.id}`, { logoUrl: localUrl });
                                                                setSelectedBrandForEdit((prev: any) => prev ? { ...prev, logoUrl: localUrl } : null);
                                                                updateBrandInList(selectedBrandForEdit.id, { logoUrl: localUrl });
                                                                toast.success("Logo caricato");
                                                            } catch (err) {
                                                                toast.error("Errore caricamento logo");
                                                            }
                                                            setIsUploadingLogo(false);
                                                        }}
                                                        className="text-xs font-bold text-white bg-slate-700 hover:bg-slate-900 px-4 py-2 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                                                    >
                                                        {isUploadingLogo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                                        Carica logo da URL
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Tono per generazione descrizioni AI</label>
                                            <textarea
                                                value={brandEditForm.aiContentGuidelines}
                                                onChange={e => setBrandEditForm(prev => ({ ...prev, aiContentGuidelines: e.target.value }))}
                                                placeholder="Es: stile tecnico e professionale, linguaggio B2B, tono sobrio..."
                                                rows={4}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 resize-y"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Dominio produttore (per immagini e dati)</label>
                                            <input
                                                type="url"
                                                value={brandEditForm.producerDomain}
                                                onChange={e => setBrandEditForm(prev => ({ ...prev, producerDomain: e.target.value }))}
                                                placeholder="https://www.marchio.it"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1.5">Usato per cercare immagini e altri dati relativi al brand.</p>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                onClick={async () => {
                                                    if (!selectedBrandForEdit) return;
                                                    setIsSavingBrand(true);
                                                    try {
                                                        await axios.put(`/api/brands/${selectedBrandForEdit.id}`, {
                                                            aiContentGuidelines: brandEditForm.aiContentGuidelines || null,
                                                            producerDomain: brandEditForm.producerDomain || null,
                                                            logoUrl: brandEditForm.logoUrl || null
                                                        });
                                                        updateBrandInList(selectedBrandForEdit.id, brandEditForm);
                                                        setSelectedBrandForEdit((prev: any) => prev ? { ...prev, ...brandEditForm } : null);
                                                        toast.success("Impostazioni brand salvate");
                                                    } catch (err) {
                                                        toast.error("Errore salvataggio");
                                                    }
                                                    setIsSavingBrand(false);
                                                }}
                                                disabled={isSavingBrand}
                                                className="flex-1 py-4 bg-[#111827] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isSavingBrand ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Salva impostazioni
                                            </button>
                                            <button
                                                onClick={() => setSelectedBrandForEdit(null)}
                                                className="py-4 px-6 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                                            >
                                                Indietro
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Catalogues Panel Modal */}
            <AnimatePresence>
                {showCataloguesPanel && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setShowCataloguesPanel(false); setSelectedCatalogueForEdit(null); setShowNewCatalogueForm(false); }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            onClick={e => e.stopPropagation()}
                            className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">
                                        {showNewCatalogueForm ? "Nuovo catalogo" : selectedCatalogueForEdit ? `Modifica: ${selectedCatalogueForEdit.name}` : "Gestione Cataloghi"}
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                        {showNewCatalogueForm ? "Nome, cartella immagini e PDF" : selectedCatalogueForEdit ? "Modifica info, cartella e PDF del catalogo" : "Modifica info, cartelle e PDF dai cataloghi"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setShowCataloguesPanel(false); setSelectedCatalogueForEdit(null); setShowNewCatalogueForm(false); }}
                                    className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all shadow-sm"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                {showNewCatalogueForm ? (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Nome catalogo</label>
                                            <input
                                                value={newCatalogueForm.name}
                                                onChange={e => setNewCatalogueForm(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="Es. Listino 2024"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Path cartella immagini</label>
                                            <div className="relative">
                                                <HardDrive className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    value={newCatalogueForm.imageFolderPath}
                                                    onChange={e => setNewCatalogueForm(prev => ({ ...prev, imageFolderPath: e.target.value }))}
                                                    placeholder="/var/www/images/project_a"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 block">PDF (path)</label>
                                                <button type="button" onClick={() => setNewCatalogueForm(prev => ({ ...prev, pdfs: [...prev.pdfs, ""] }))} className="text-[9px] font-black uppercase text-slate-600 hover:text-slate-900">+ Aggiungi PDF</button>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 block">Brand</label>
                                                <select value={newCatalogueForm.brandId} onChange={e => setNewCatalogueForm(prev => ({ ...prev, brandId: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm">
                                                    <option value="">Nessuno</option>
                                                    {(allBrands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                {newCatalogueForm.pdfs.map((path, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <input
                                                            value={path}
                                                            onChange={e => { const u = [...newCatalogueForm.pdfs]; u[idx] = e.target.value; setNewCatalogueForm(prev => ({ ...prev, pdfs: u })); }}
                                                            placeholder="/uploads/catalogo.pdf"
                                                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-200"
                                                        />
                                                        <button type="button" onClick={() => setNewCatalogueForm(prev => ({ ...prev, pdfs: prev.pdfs.filter((_, i) => i !== idx) }))} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button onClick={() => setShowNewCatalogueForm(false)} className="py-4 px-6 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200">Annulla</button>
                                            <button
                                                disabled={!newCatalogueForm.name.trim() || isCreatingCatalogue}
                                                onClick={async () => {
                                                    setIsCreatingCatalogue(true);
                                                    try {
                                                        await axios.post("/api/catalogues", {
                                                            name: newCatalogueForm.name.trim(),
                                                            imageFolderPath: newCatalogueForm.imageFolderPath.trim() || undefined,
                                                            pdfs: newCatalogueForm.pdfs.filter(p => p.trim() !== ""),
                                                            brandId: newCatalogueForm.brandId ? Number(newCatalogueForm.brandId) : null
                                                        });
                                                        toast.success("Catalogo creato");
                                                        setNewCatalogueForm({ name: "", imageFolderPath: "", pdfs: [""], brandId: "" });
                                                        setShowNewCatalogueForm(false);
                                                        fetchCatalogues();
                                                    } catch (err: any) {
                                                        toast.error(err?.response?.data?.error || "Errore creazione");
                                                    }
                                                    setIsCreatingCatalogue(false);
                                                }}
                                                className="flex-1 py-4 bg-[#111827] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-black flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isCreatingCatalogue ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                                Crea catalogo
                                            </button>
                                        </div>
                                    </div>
                                ) : selectedCatalogueForEdit ? (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Nome</label>
                                            <input
                                                value={catalogueEditForm.name}
                                                onChange={e => setCatalogueEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Path cartella immagini</label>
                                            <div className="relative">
                                                <HardDrive className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    value={catalogueEditForm.imageFolderPath}
                                                    onChange={e => setCatalogueEditForm(prev => ({ ...prev, imageFolderPath: e.target.value }))}
                                                    placeholder="/var/www/images/project_a"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Stato</label>
                                            <select
                                                value={catalogueEditForm.status}
                                                onChange={e => setCatalogueEditForm(prev => ({ ...prev, status: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            >
                                                <option value="draft">Bozza</option>
                                                <option value="processing">In elaborazione</option>
                                                <option value="staging">Staging</option>
                                                <option value="completed">Completato</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Ultimo listino (opzionale)</label>
                                            <input
                                                value={catalogueEditForm.lastListinoName}
                                                onChange={e => setCatalogueEditForm(prev => ({ ...prev, lastListinoName: e.target.value }))}
                                                placeholder="Nome file listino"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">Brand (cartella export: nomeBrand/images)</label>
                                            <select
                                                value={catalogueEditForm.brandId}
                                                onChange={e => setCatalogueEditForm(prev => ({ ...prev, brandId: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                                            >
                                                <option value="">Nessuno</option>
                                                {(allBrands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 block">PDF – carica dal PC o path</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        ref={catalogPdfInputRef}
                                                        type="file"
                                                        accept=".pdf,application/pdf"
                                                        className="hidden"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file || !selectedCatalogueForEdit) return;
                                                            e.target.value = "";
                                                            setIsUploadingCatalogPdf(true);
                                                            const toastId = toast.loading(`Caricamento ${file.name}...`);
                                                            try {
                                                                const blob = new Blob([file], { type: "application/pdf" });
                                                                const res = await axios.post(`/api/repositories/${selectedCatalogueForEdit.id}/pdfs`, blob, {
                                                                    headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) },
                                                                    maxContentLength: Infinity,
                                                                    maxBodyLength: Infinity
                                                                });
                                                                const path = res.data?.filePath;
                                                                if (path) setCatalogueEditForm(prev => ({ ...prev, pdfs: [...prev.pdfs, path] }));
                                                                toast.update(toastId, { render: "PDF caricato.", type: "success", isLoading: false, autoClose: 2000 });
                                                            } catch (err: any) {
                                                                toast.update(toastId, { render: err?.response?.data?.error || "Errore upload", type: "error", isLoading: false, autoClose: 3000 });
                                                            } finally {
                                                                setIsUploadingCatalogPdf(false);
                                                            }
                                                        }}
                                                    />
                                                    <button type="button" onClick={() => catalogPdfInputRef.current?.click()} disabled={isUploadingCatalogPdf} className="text-[9px] font-black uppercase text-slate-600 hover:text-slate-900 flex items-center gap-1 disabled:opacity-50">
                                                        {isUploadingCatalogPdf ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                                        Carica dal PC
                                                    </button>
                                                    <button type="button" onClick={() => setCatalogueEditForm(prev => ({ ...prev, pdfs: [...prev.pdfs, ""] }))} className="text-[9px] font-black uppercase text-slate-600 hover:text-slate-900">+ Path</button>
                                                </div>
                                            </div>
                                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                                {catalogueEditForm.pdfs.map((path, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <input
                                                            value={path}
                                                            onChange={e => { const u = [...catalogueEditForm.pdfs]; u[idx] = e.target.value; setCatalogueEditForm(prev => ({ ...prev, pdfs: u })); }}
                                                            placeholder="/uploads/catalogo.pdf"
                                                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-200"
                                                        />
                                                        <button type="button" onClick={() => setCatalogueEditForm(prev => ({ ...prev, pdfs: prev.pdfs.filter((_, i) => i !== idx) }))} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button onClick={() => { setSelectedCatalogueForEdit(null); }} className="py-4 px-6 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200">Indietro</button>
                                            <button
                                                disabled={isSavingCatalogue}
                                                onClick={async () => {
                                                    if (!selectedCatalogueForEdit) return;
                                                    setIsSavingCatalogue(true);
                                                    try {
                                                        await axios.patch(`/api/catalogues/${selectedCatalogueForEdit.id}`, {
                                                            name: catalogueEditForm.name.trim(),
                                                            imageFolderPath: catalogueEditForm.imageFolderPath.trim() || null,
                                                            status: catalogueEditForm.status,
                                                            lastListinoName: catalogueEditForm.lastListinoName.trim() || null,
                                                            pdfs: catalogueEditForm.pdfs.filter(p => p.trim() !== ""),
                                                            brandId: catalogueEditForm.brandId ? Number(catalogueEditForm.brandId) : null
                                                        });
                                                        toast.success("Catalogo aggiornato");
                                                        setSelectedCatalogueForEdit(null);
                                                        fetchCatalogues();
                                                    } catch (err: any) {
                                                        toast.error(err?.response?.data?.error || "Errore salvataggio");
                                                    }
                                                    setIsSavingCatalogue(false);
                                                }}
                                                className="flex-1 py-4 bg-[#111827] text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-black flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isSavingCatalogue ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                Salva modifiche
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setShowNewCatalogueForm(true)}
                                            className="w-full py-4 mb-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase tracking-widest text-xs rounded-2xl flex items-center justify-center gap-2 transition-all border-2 border-dashed border-slate-200"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Nuovo catalogo
                                        </button>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {catalogues.map((cat: any) => (
                                                <div
                                                    key={cat.id}
                                                    className="bg-gray-50 border border-gray-100 rounded-2xl p-5 flex items-center gap-4 hover:border-slate-200 transition-all"
                                                >
                                                    <div className="w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                                                        <Box className="w-7 h-7 text-gray-400" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-black text-gray-900 truncate">{cat.name}</p>
                                                        <p className="text-[11px] font-bold text-gray-500 mt-0.5">
                                                            {cat.pdfs?.length ?? 0} PDF · {cat.imageFolderPath ? "Cartella configurata" : "Nessuna cartella"}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedCatalogueForEdit(cat);
                                                            setCatalogueEditForm({
                                                                name: cat.name || "",
                                                                imageFolderPath: cat.imageFolderPath || "",
                                                                status: cat.status || "draft",
                                                                lastListinoName: cat.lastListinoName || "",
                                                                pdfs: (cat.pdfs || []).map((p: any) => p.filePath || p.fileName || ""),
                                                                brandId: cat.brandId ?? ""
                                                            });
                                                        }}
                                                        className="p-2.5 bg-[#111827] text-white rounded-xl hover:bg-black transition-all shrink-0"
                                                    >
                                                        <Settings className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        {catalogues.length === 0 && (
                                            <p className="text-center text-gray-400 text-sm py-8">Nessun catalogo. Clicca &quot;Nuovo catalogo&quot; per crearne uno.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal Seleziona da catalogo (crop) */}
            <AnimatePresence>
                {showCatalogCropModal && selectedProduct && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCatalogCropModal(false)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                                <h3 className="text-lg font-black text-slate-900">Seleziona da catalogo – {selectedProduct.sku}</h3>
                                <button onClick={() => setShowCatalogCropModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6">
                                {catalogCropStep === 'catalog' && (
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase text-slate-600 block">Scegli catalogo</label>
                                        <select
                                            value={catalogCropCatalogId ?? ""}
                                            onChange={e => { const v = e.target.value; setCatalogCropCatalogId(v ? parseInt(v) : null); }}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3"
                                        >
                                            <option value="">-- Seleziona --</option>
                                            {(catalogues || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <button
                                            disabled={!catalogCropCatalogId}
                                            onClick={async () => {
                                                if (!catalogCropCatalogId) return;
                                                try {
                                                    const r = await axios.get(`/api/catalogues/${catalogCropCatalogId}/page-matches`);
                                                    const list = Array.isArray(r.data) ? r.data : [];
                                                    const forProduct = list.filter((p: any) => (p.matchedProducts || []).some((m: any) => m.productId === selectedProduct.id));
                                                    setCatalogCropMatches(forProduct);
                                                    setCatalogCropStep('page');
                                                } catch { toast.error("Errore caricamento pagine"); }
                                            }}
                                            className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase disabled:opacity-50"
                                        >
                                            Carica pagine associate
                                        </button>
                                    </div>
                                )}
                                {catalogCropStep === 'page' && (
                                    <div className="space-y-4">
                                        <button onClick={() => { setCatalogCropStep('catalog'); setCatalogCropMatches([]); }} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">← Cambia catalogo</button>
                                        <p className="text-[10px] font-black uppercase text-slate-600">Pagine con SKU/EAN di questo prodotto ({catalogCropMatches.length})</p>
                                        {catalogCropMatches.length === 0 ? (
                                            <p className="text-gray-500 py-6">Nessuna pagina trovata. Assicurati che il prodotto sia nel catalogo e che le pagine siano state sincronizzate.</p>
                                        ) : (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                                                {catalogCropMatches.map((page: any, idx: number) => {
                                                    const src = page.imageUrl?.startsWith("data:") || page.imageUrl?.startsWith("/") ? page.imageUrl : page.imageUrl;
                                                    return (
                                                        <button
                                                            key={page.pageId || idx}
                                                            type="button"
                                                            className="relative aspect-[3/4] rounded-xl overflow-hidden border-2 border-gray-200 hover:border-slate-900 bg-gray-50"
                                                            onClick={() => { setCatalogCropPage(page); setCatalogCropImageUrl(page.imageUrl); setCatalogCropStep('crop'); setCatalogCropBox(null); }}
                                                        >
                                                            <img src={src} alt={`Pagina ${page.pageNumber}`} className="w-full h-full object-contain" />
                                                            <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">Pg {page.pageNumber}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {catalogCropStep === 'crop' && catalogCropImageUrl && (
                                    <div className="space-y-4">
                                        <button onClick={() => { setCatalogCropStep('page'); setCatalogCropPage(null); setCatalogCropImageUrl(null); }} className="text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">← Scegli altra pagina</button>
                                        <p className="text-[10px] font-black uppercase text-slate-600">Seleziona l’area da usare come immagine prodotto (trascina sul riquadro). Oppure usa l’immagine intera.</p>
                                        <div
                                            className="relative inline-block max-w-full bg-gray-100 rounded-xl overflow-hidden cursor-crosshair"
                                            style={{ maxHeight: "60vh" }}
                                            onMouseDown={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = (e.clientX - rect.left) / rect.width;
                                                const y = (e.clientY - rect.top) / rect.height;
                                                setCatalogCropBox({ x, y, width: 0, height: 0 });
                                            }}
                                            onMouseMove={(e) => {
                                                if (!catalogCropBox || e.buttons !== 1) return;
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = (e.clientX - rect.left) / rect.width;
                                                const y = (e.clientY - rect.top) / rect.height;
                                                const x0 = catalogCropBox.x;
                                                const y0 = catalogCropBox.y;
                                                setCatalogCropBox({ x: Math.min(x0, x), y: Math.min(y0, y), width: Math.abs(x - x0), height: Math.abs(y - y0) });
                                            }}
                                            onMouseUp={() => {}}
                                            onMouseLeave={() => {}}
                                        >
                                            <img
                                                ref={el => { catalogCropImgRef.current = el ?? null; }}
                                                src={catalogCropImageUrl}
                                                alt="Crop"
                                                className="max-w-full max-h-[60vh] object-contain block select-none pointer-events-none"
                                                draggable={false}
                                                onLoad={() => setCatalogCropBox(null)}
                                            />
                                            {catalogCropBox && catalogCropBox.width > 0 && catalogCropBox.height > 0 && (
                                                <div
                                                    className="absolute border-2 border-slate-900 bg-slate-900/20 pointer-events-none"
                                                    style={{
                                                        left: `${catalogCropBox.x * 100}%`,
                                                        top: `${catalogCropBox.y * 100}%`,
                                                        width: `${catalogCropBox.width * 100}%`,
                                                        height: `${catalogCropBox.height * 100}%`
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => setCatalogCropBox(null)} className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-xs">Reimposta selezione</button>
                                            <button
                                                onClick={async () => {
                                                    const img = catalogCropImgRef.current;
                                                    if (!img || !selectedProduct?.id) return;
                                                    let dataUrl: string;
                                                    if (catalogCropBox && catalogCropBox.width > 0.02 && catalogCropBox.height > 0.02) {
                                                        const c = document.createElement("canvas");
                                                        c.width = img.naturalWidth * catalogCropBox.width;
                                                        c.height = img.naturalHeight * catalogCropBox.height;
                                                        const ctx = c.getContext("2d");
                                                        if (!ctx) return;
                                                        ctx.drawImage(img, img.naturalWidth * catalogCropBox.x, img.naturalHeight * catalogCropBox.y, img.naturalWidth * catalogCropBox.width, img.naturalHeight * catalogCropBox.height, 0, 0, c.width, c.height);
                                                        dataUrl = c.toDataURL("image/jpeg", 0.92);
                                                    } else {
                                                        const c = document.createElement("canvas");
                                                        c.width = img.naturalWidth;
                                                        c.height = img.naturalHeight;
                                                        const ctx = c.getContext("2d");
                                                        if (!ctx) return;
                                                        ctx.drawImage(img, 0, 0);
                                                        dataUrl = c.toDataURL("image/jpeg", 0.92);
                                                    }
                                                    try {
                                                        const r = await axios.post(`/api/products/${selectedProduct.id}/image-from-crop`, { dataUrl, brandName: selectedProduct.brand || "" });
                                                        const newImages = [...(selectedProduct.images || []), { id: r.data.id, url: r.data.imageUrl }];
                                                        setSelectedProduct({ ...selectedProduct, images: newImages });
                                                        toast.success("Immagine salvata in " + (selectedProduct.brand ? `${selectedProduct.brand}/images` : "products"));
                                                        setShowCatalogCropModal(false);
                                                    } catch (err: any) {
                                                        toast.error(err?.response?.data?.error || "Errore salvataggio");
                                                    }
                                                }}
                                                className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase"
                                            >
                                                Associa immagine (salva in cartella brand)
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                            <div className="flex items-center gap-3 flex-wrap justify-center max-w-[95vw]">
                                <button
                                    type="button"
                                    onClick={() => setShowBulkOperationsModal(true)}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-white bg-white/15 px-3 py-1.5 rounded-xl hover:bg-white/25 transition-all text-[11px] font-black uppercase tracking-widest"
                                >
                                    <Layers className="w-4 h-4" />
                                    Centro modifiche
                                </button>
                                <button
                                    onClick={handleBulkNormalizeTitles}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-emerald-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Wand2 className={`w-4 h-4 ${isBulkWorking ? 'animate-spin' : ''}`} />
                                    {isBulkWorking ? 'Elaborazione...' : 'Normalizza Titoli'}
                                </button>
                                <button
                                    onClick={handleBulkAddTitlePrefix}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-amber-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Plus className="w-4 h-4" />
                                    Aggiungi Testo al Titolo
                                </button>
                                <button
                                    onClick={handleBulkReplaceTitlePart}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-cyan-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Wand2 className="w-4 h-4" />
                                    Trova/Sostituisci + Agg. Titolo
                                </button>
                                <button
                                    onClick={() => setShowBulkTitleFieldsModal(true)}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-violet-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Campi nel titolo
                                </button>
                                <button
                                    onClick={() => setShowBulkSeoModal(true)}
                                    disabled={isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-indigo-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Genera SEO AI
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void exportSelectedToFile("excel")}
                                    disabled={isExportingSelectedFile || isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-sky-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />
                                    {isExportingSelectedFile ? "Esportazione…" : "Esporta Excel"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void exportSelectedToFile("csv")}
                                    disabled={isExportingSelectedFile || isBulkWorking || !brandFilter}
                                    className="flex items-center gap-2 text-teal-300 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />
                                    {isExportingSelectedFile ? "Esportazione…" : "Esporta CSV"}
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isBulkDeleting || !brandFilter}
                                    className="flex items-center gap-2 text-red-400 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                    <Trash2 className={`w-4 h-4 ${isBulkDeleting ? 'animate-spin' : ''}`} />
                                    {isBulkDeleting ? 'Eliminazione...' : 'Elimina Massa'}
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

            {/* Centro modifiche massive: valore campo + azioni già esistenti */}
            <AnimatePresence>
                {showBulkOperationsModal && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowBulkOperationsModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-gray-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-5 pb-3 bg-white border-b border-gray-100">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2.5 bg-slate-900 rounded-xl shrink-0">
                                        <Layers className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-black text-gray-900 leading-tight">Modifiche massive</h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {selectedIds.length} prodotti selezionati
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkOperationsModal(false)}
                                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                                    aria-label="Chiudi"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 space-y-8">
                                <section>
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                                        Imposta lo stesso valore su un campo
                                    </h4>
                                    <p className="text-xs text-slate-600 mb-3">
                                        Tutti i campi prodotto (SKU, FK categoria/brand, testi IT, prezzo, valuta, extra).
                                        Valore vuoto dove consentito azzera il campo o rimuove un extra. Con &quot;Solo se
                                        vuoto&quot; non sovrascrivi dati già presenti.
                                    </p>
                                    <div className="space-y-3">
                                        <label className="block">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Campo</span>
                                            <select
                                                value={bulkOpFieldPath}
                                                onChange={(e) => setBulkOpFieldPath(e.target.value)}
                                                className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                                            >
                                                {BULK_SET_FIELD_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {bulkOpFieldPath === "__extra_custom__" && (
                                            <label className="block">
                                                <span className="text-[10px] font-black uppercase text-slate-400">
                                                    Chiave extra (ERP)
                                                </span>
                                                <input
                                                    type="text"
                                                    value={bulkOpExtraKey}
                                                    onChange={(e) => setBulkOpExtraKey(e.target.value)}
                                                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"
                                                    placeholder="es. stagione"
                                                />
                                            </label>
                                        )}
                                        <label className="block">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Valore</span>
                                            <textarea
                                                value={bulkOpValue}
                                                onChange={(e) => setBulkOpValue(e.target.value)}
                                                rows={2}
                                                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                                                placeholder={bulkSetFieldValuePlaceholder(
                                                    bulkOpFieldPath,
                                                    bulkOpExtraKey
                                                )}
                                            />
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={bulkOpOnlyEmpty}
                                                onChange={(e) => setBulkOpOnlyEmpty(e.target.checked)}
                                                className="rounded border-slate-300 text-slate-900"
                                            />
                                            <span className="text-xs font-bold text-slate-700">
                                                Applica solo se il campo è vuoto
                                            </span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleBulkSetFieldMass}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="w-full py-3 px-4 bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-black disabled:opacity-50"
                                        >
                                            {isBulkWorking ? "Elaborazione…" : "Applica valore ai selezionati"}
                                        </button>
                                    </div>
                                </section>

                                <section className="border-t border-slate-100 pt-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                                        Titoli (IT)
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void handleBulkNormalizeTitles(), 0);
                                            }}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 text-[11px] font-black uppercase border border-emerald-100 hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                            Normalizza titoli
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void handleBulkAddTitlePrefix(), 0);
                                            }}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-amber-50 text-amber-900 text-[11px] font-black uppercase border border-amber-100 hover:bg-amber-100 disabled:opacity-50"
                                        >
                                            Prefisso titolo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void handleBulkReplaceTitlePart(), 0);
                                            }}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-cyan-50 text-cyan-900 text-[11px] font-black uppercase border border-cyan-100 hover:bg-cyan-100 disabled:opacity-50"
                                        >
                                            Trova / sostituisci titolo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setShowBulkTitleFieldsModal(true);
                                            }}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-violet-50 text-violet-900 text-[11px] font-black uppercase border border-violet-100 hover:bg-violet-100 disabled:opacity-50"
                                        >
                                            Campi nel titolo
                                        </button>
                                    </div>
                                </section>

                                <section className="border-t border-slate-100 pt-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                                        Contenuti & SEO
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setShowBulkSeoModal(true);
                                            }}
                                            disabled={isBulkWorking || !brandFilter}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-900 text-[11px] font-black uppercase border border-indigo-100 hover:bg-indigo-100 disabled:opacity-50"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            Genera SEO AI
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void handleBulkTranslateTitle(), 0);
                                            }}
                                            disabled={isBulkTranslatingTitle || isBulkWorking || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-white text-slate-900 text-[11px] font-black uppercase border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Traduci titolo ({editLang.toUpperCase()})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void exportSelectedToFile("excel"), 0);
                                            }}
                                            disabled={isExportingSelectedFile || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-white text-slate-900 text-[11px] font-black uppercase border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Esporta Excel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void exportSelectedToFile("csv"), 0);
                                            }}
                                            disabled={isExportingSelectedFile || !brandFilter}
                                            className="px-3 py-2 rounded-xl bg-white text-slate-900 text-[11px] font-black uppercase border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Esporta CSV
                                        </button>
                                    </div>
                                </section>

                                <section className="border-t border-slate-100 pt-6">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-3">
                                        Pericolo
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowBulkOperationsModal(false);
                                            setTimeout(() => void handleBulkDelete(), 0);
                                        }}
                                        disabled={isBulkDeleting || !brandFilter}
                                        className="px-4 py-2.5 rounded-xl bg-red-50 text-red-800 text-[11px] font-black uppercase border border-red-100 hover:bg-red-100 disabled:opacity-50"
                                    >
                                        Elimina prodotti selezionati
                                    </button>
                                </section>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal scelta sovrascrittura SEO AI */}
            <AnimatePresence>
                {showBulkSeoModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowBulkSeoModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-gray-100"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-indigo-100 rounded-xl">
                                    <Sparkles className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Genera contenuti SEO AI</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{selectedIds.length} prodotti selezionati</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-6">
                                Alcuni prodotti potrebbero già avere descrizione, breve SEO o punti elenco. Come vuoi procedere?
                            </p>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleBulkGenerateSeoAi(true)}
                                    className="w-full py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all text-sm"
                                >
                                    Sovrascrivi esistenti
                                </button>
                                <button
                                    onClick={() => handleBulkGenerateSeoAi(false)}
                                    className="w-full py-3 px-4 bg-gray-100 text-gray-800 font-bold rounded-xl hover:bg-gray-200 transition-all text-sm"
                                >
                                    Genera solo dove mancano
                                </button>
                                <button
                                    onClick={() => setShowBulkSeoModal(false)}
                                    className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                >
                                    Annulla
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Background AI bulk status (non-bloccante) */}
            {aiBulkJob && (
                <div className="fixed bottom-4 right-4 z-[120] bg-white border border-slate-200 shadow-xl rounded-2xl p-4 w-[320px]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                AI massiva in background
                            </p>
                            <p className="text-sm font-black text-slate-900 mt-1">
                                {aiBulkJob.done}/{aiBulkJob.total}{" "}
                                {aiBulkJob.errors ? (
                                    <span className="text-amber-700">({aiBulkJob.errors} errori)</span>
                                ) : null}
                            </p>
                            {aiBulkJob.currentProductId ? (
                                <p className="text-[11px] text-slate-500 mt-1 truncate">
                                    In corso su ID: {aiBulkJob.currentProductId}
                                </p>
                            ) : null}
                            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className="h-full bg-indigo-600"
                                    style={{
                                        width:
                                            aiBulkJob.total > 0
                                                ? `${Math.round((aiBulkJob.done / aiBulkJob.total) * 100)}%`
                                                : "0%",
                                    }}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            className="text-slate-400 hover:text-slate-700"
                            onClick={() => setAiBulkJob(null)}
                            title="Nascondi"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={pauseResumeAiBulk}
                            disabled={!aiBulkJob.running}
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-40"
                        >
                            {aiBulkJob.paused ? "Riprendi" : "Pausa"}
                        </button>
                        <button
                            type="button"
                            onClick={stopAiBulk}
                            className="flex-1 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-widest hover:bg-red-100"
                        >
                            Stop
                        </button>
                    </div>
                    {aiBulkReport && !aiBulkJob.running && (
                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowAiBulkReport(true)}
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
                            >
                                Visualizza report
                            </button>
                            <button
                                type="button"
                                onClick={() => downloadAiBulkReportCsv(aiBulkReport)}
                                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black"
                            >
                                Scarica CSV
                            </button>
                        </div>
                    )}
                    {!aiBulkJob.running && (
                        <p className="mt-2 text-[11px] text-slate-500">
                            Completato. La lista si aggiorna automaticamente.
                        </p>
                    )}
                </div>
            )}

            {/* Modal report AI bulk */}
            <AnimatePresence>
                {showAiBulkReport && aiBulkReport && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowAiBulkReport(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.98, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.98, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-4xl w-full border border-gray-100 max-h-[90vh] overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Report generazione AI massiva</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {new Date(aiBulkReport.at).toLocaleString("it-IT")} · Totale {aiBulkReport.total} · Errori{" "}
                                        {aiBulkReport.errors}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => downloadAiBulkReportCsv(aiBulkReport)}
                                        className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase hover:bg-black"
                                    >
                                        Scarica CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAiBulkReport(false)}
                                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                                        title="Chiudi"
                                    >
                                        <X className="w-4 h-4 text-slate-700" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                                <div className="max-h-[65vh] overflow-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    ID
                                                </th>
                                                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    SKU
                                                </th>
                                                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    Titolo
                                                </th>
                                                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    Esito
                                                </th>
                                                <th className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    Messaggio
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {aiBulkReport.rows.map((r) => (
                                                <tr key={`ai-rep-${r.productId}-${r.outcome}`}>
                                                    <td className="px-3 py-2 text-[11px] font-mono text-slate-700">
                                                        {r.productId}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] font-mono text-slate-900">
                                                        {r.sku}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] text-slate-700 max-w-[360px] truncate">
                                                        {r.title}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] font-black">
                                                        {r.outcome === "ok" ? (
                                                            <span className="text-emerald-700">OK</span>
                                                        ) : (
                                                            <span className="text-amber-800">ERRORE</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[520px] truncate">
                                                        {r.message || "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal: campi dello stesso prodotto concatenati al titolo (IT) */}
            <AnimatePresence>
                {showBulkTitleFieldsModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowBulkTitleFieldsModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-gray-100 max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-violet-100 rounded-xl">
                                    <Link2 className="w-6 h-6 text-violet-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Campi nel titolo</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {selectedIds.length} prodotti · lingua IT · valori presi da ogni singolo articolo
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-gray-600 mb-3 font-medium">
                                Dove inserire il blocco campi (separati dal titolo con il separatore sotto):
                            </p>
                            <div className="flex gap-2 mb-4">
                                <button
                                    type="button"
                                    onClick={() => setBulkTitleFieldsPosition("start")}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border-2 transition-all ${
                                        bulkTitleFieldsPosition === "start"
                                            ? "border-violet-600 bg-violet-50 text-violet-900"
                                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                                    }`}
                                >
                                    Inizio titolo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBulkTitleFieldsPosition("end")}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border-2 transition-all ${
                                        bulkTitleFieldsPosition === "end"
                                            ? "border-violet-600 bg-violet-50 text-violet-900"
                                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                                    }`}
                                >
                                    Fine titolo
                                </button>
                            </div>

                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">
                                Separatore tra i campi (e tra blocco e titolo)
                            </label>
                            <input
                                type="text"
                                value={bulkTitleFieldsSeparator}
                                onChange={(e) => setBulkTitleFieldsSeparator(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2 font-mono"
                                placeholder=" · "
                            />
                            <p className="text-[10px] text-gray-500 mb-4">
                                Se lasci vuoto si usa automaticamente <code className="bg-gray-100 px-1 rounded"> · </code>.
                                Altri esempi: <code className="bg-gray-100 px-1 rounded"> - </code>,{" "}
                                <code className="bg-gray-100 px-1 rounded">, </code>
                            </p>

                            <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
                                Campi da includere (ordine = ordine nel titolo)
                            </p>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {TITLE_FIELD_PRESETS.map((pf) => (
                                    <label
                                        key={pf.id}
                                        className="flex items-center gap-2 text-xs cursor-pointer select-none text-gray-700"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={bulkTitleFieldsSelected.includes(pf.id)}
                                            onChange={() => toggleBulkTitleField(pf.id)}
                                            className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        {pf.label}
                                    </label>
                                ))}
                            </div>

                            {bulkTitleFieldsSelected.length > 0 && (
                                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Ordine nel titolo</p>
                                    <ul className="space-y-1">
                                        {bulkTitleFieldsSelected.map((fid, idx) => {
                                            const lab =
                                                TITLE_FIELD_PRESETS.find((p) => p.id === fid)?.label || fid;
                                            return (
                                                <li
                                                    key={`${fid}-${idx}`}
                                                    className="flex items-center justify-between gap-2 text-xs text-slate-800"
                                                >
                                                    <span>
                                                        {idx + 1}. {lab}
                                                    </span>
                                                    <span className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            disabled={idx === 0}
                                                            onClick={() => moveBulkTitleField(idx, -1)}
                                                            className="p-1 rounded-lg hover:bg-white disabled:opacity-30"
                                                            title="Su"
                                                        >
                                                            <ArrowUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={idx === bulkTitleFieldsSelected.length - 1}
                                                            onClick={() => moveBulkTitleField(idx, 1)}
                                                            className="p-1 rounded-lg hover:bg-white disabled:opacity-30"
                                                            title="Giù"
                                                        >
                                                            <ArrowDown className="w-3.5 h-3.5" />
                                                        </button>
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">
                                Altri campi extra (chiavi ERP, separate da virgola, in coda)
                            </label>
                            <input
                                type="text"
                                value={bulkTitleFieldsCustom}
                                onChange={(e) => setBulkTitleFieldsCustom(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4"
                                placeholder="es. stagione, cod_fornitore"
                            />

                            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                                {bulkTitleFieldsSelected.length === 0 &&
                                    !bulkTitleFieldsCustom.split(",").some((s) => s.trim().length > 0) && (
                                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            Seleziona almeno un campo qui sopra oppure indica chiavi extra (nome campo in
                                            ERP), altrimenti il titolo non cambia.
                                        </p>
                                    )}
                                <button
                                    type="button"
                                    onClick={handleBulkAppendFieldsToTitle}
                                    disabled={
                                        isBulkWorking ||
                                        (bulkTitleFieldsSelected.length === 0 &&
                                            !bulkTitleFieldsCustom.split(",").some((s) => s.trim().length > 0))
                                    }
                                    className="w-full py-3 px-4 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all text-sm disabled:opacity-50"
                                >
                                    Applica ai selezionati
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkTitleFieldsModal(false)}
                                    className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                >
                                    Annulla
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Zoom immagine (tutte le sorgenti) */}
            <AnimatePresence>
                {zoomImageUrl && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[190] flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setZoomImageUrl(null)}
                    >
                        <img
                            src={zoomImageUrl}
                            alt="Preview"
                            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <button
                            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 text-white"
                            onClick={() => setZoomImageUrl(null)}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Global Attribute Modal */}
            <AnimatePresence>
                {isAttributeModalOpen && selectedAttributeKey && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
                            onClick={() => setIsAttributeModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20"
                        >
                            <div className="px-10 py-8 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-5">
                                    <div className="p-4 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200/50 rotate-3">
                                        <Layers className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none uppercase">{selectedAttributeKey}</h2>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Global Attribute Manager
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsAttributeModalOpen(false)}
                                    className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-2xl shadow-sm border border-gray-100 transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex px-10 bg-white border-b border-gray-100">
                                <button
                                    onClick={() => setAttributeTab('values')}
                                    className={`px-8 py-5 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 ${attributeTab === 'values' ? 'border-emerald-600 text-slate-900 bg-slate-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Valori Disponibili
                                </button>
                                <button
                                    onClick={() => setAttributeTab('products')}
                                    className={`px-8 py-5 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 ${attributeTab === 'products' ? 'border-emerald-600 text-slate-900 bg-slate-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    Prodotti Associati
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                                {attributeTab === 'values' ? (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between mb-8">
                                            <p className="text-sm font-medium text-slate-500 italic">Elenco di tutti i valori unici rilevati nel catalogo per l'attributo <span className="font-black text-slate-900 not-italic">"{selectedAttributeKey}"</span>.</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* We mock values from current loaded products for now, normally this would be a fetch to a pool of unique attributes */}
                                            {Array.from(new Set(products
                                                .map(p => {
                                                    const bullets = (p.translations?.[editLang]?.bulletPoints || "").split('\n');
                                                    const bulletLine = bullets.find((ln: string) => ln.includes(`${selectedAttributeKey}:`));
                                                    return bulletLine ? bulletLine.split(':')[1].trim() : null;
                                                })
                                                .filter(Boolean)
                                            )).map((val: any, i) => (
                                                <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-emerald-100 transition-all hover:shadow-xl hover:shadow-emerald-900/5">
                                                    <span className="text-sm font-black text-slate-700">{val}</span>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button className="p-2 text-slate-300 hover:text-emerald-600 transition-colors"><Edit className="w-4 h-4" /></button>
                                                        <button className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                            <button className="flex items-center justify-center p-5 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:border-emerald-200 hover:text-emerald-600 transition-all bg-slate-50/30 hover:bg-emerald-50/30">
                                                <Plus className="w-4 h-4 mr-2" /> Aggiungi Nuovo Valore
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-slate-900 rounded-[2rem] p-8 text-white mb-8 shadow-2xl shadow-slate-900/20">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-emerald-400 mb-2">Network Inventory</h4>
                                                    <p className="text-[11px] text-slate-300 font-medium">Visualizzazione di tutti i prodotti che condividono l'attributo <span className="font-bold text-white underline decoration-emerald-500 underline-offset-4">{selectedAttributeKey}</span>.</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-3xl font-black text-white">{products.filter(p => (p.translations?.[editLang]?.bulletPoints || "").includes(`${selectedAttributeKey}:`)).length}</p>
                                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Coincidenze</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-3xl border border-gray-100 overflow-x-auto shadow-sm">
                                            <table className="w-full text-left min-w-[600px]">
                                                <thead className="bg-slate-50 border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">SKU</th>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">EAN</th>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Titolo Prodotto</th>
                                                        <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Valore</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {products
                                                        .filter(p => (p.translations?.[editLang]?.bulletPoints || "").includes(`${selectedAttributeKey}:`))
                                                        .map((p: any) => {
                                                            const bullets = (p.translations?.[editLang]?.bulletPoints || "").split('\n');
                                                            const bulletLine = bullets.find((ln: string) => ln.includes(`${selectedAttributeKey}:`));
                                                            const val = bulletLine ? bulletLine.split(':')[1].trim() : '-';
                                                            return (
                                                                <tr
                                                                    key={p.id}
                                                                    onClick={() => {
                                                                        setSelectedProduct(p);
                                                                        setIsAttributeModalOpen(false);
                                                                    }}
                                                                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                                                >
                                                                    <td className="px-6 py-4 font-mono text-[10px] font-black text-slate-700">{p.sku}</td>
                                                                    <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{p.ean || '-'}</td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="text-xs font-black text-slate-900 group-hover:text-emerald-600 transition-colors uppercase truncate max-w-xs">{p.title}</div>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full uppercase italic">{val}</span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-10 py-6 bg-slate-50 border-t border-gray-100 flex justify-end">
                                <button
                                    onClick={() => setIsAttributeModalOpen(false)}
                                    className="px-8 py-3 bg-slate-900 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl hover:bg-black transition-all shadow-xl shadow-slate-900/20"
                                >
                                    Chiudi Gestione
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

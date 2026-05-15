"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useDeferredValue } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import {
    Search, Plus, Trash2, Upload, FileText, ImageIcon, Check, MousePointer2, Settings, List, RefreshCw,
    Filter, ExternalLink, Wand2, Globe, Sparkles,
    FolderOpen, ChevronLeft, ChevronRight, Languages, ShoppingCart, Box, ChevronDown,
    LayoutGrid, Package, Edit, X, CheckCircle2, History as HistoryIcon, AlertCircle, Save, Image as ImageIconLucide, Layers,
    Building2, ImagePlus, Link2, ArrowUp, ArrowDown, Store, FileSpreadsheet, Eraser
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import EdgeScroll from "./EdgeScroll";
import { ClearableSearchInput } from "@/components/ClearableSearchInput";
import { SearchableSelect } from "./SearchableSelect";
import { MultiSearchableSelect } from "./MultiSearchableSelect";
import { useSession } from "next-auth/react";
import { useCompanyContext } from "@/contexts/CompanyContext";
import { useActivityContext } from "@/contexts/ActivityContext";
import InfoHint from "@/components/InfoHint";
import { HoverTooltip } from "./HoverTooltip";
import { INFO_HINTS } from "@/components/info-hints";
import { STOCK_EXTRA_ALIAS_MAP } from "@/lib/stock-extra";
import {
    DEFAULT_PRESTA_PUSH_OVERWRITE,
    DEFAULT_WOO_PUSH_OVERWRITE,
    type PrestaPushFieldOverwrite,
    type WooPushFieldOverwrite,
} from "@/lib/channel-push-overwrite";
import { fetchAllProductsPages } from "@/lib/fetch-all-products";
import { stripHtmlToPlainText } from "@/lib/strip-html-to-plain-text";
import { useAppDialogs } from "@/components/AppDialogsProvider";
import { TechnicalSheetPanel } from "@/components/TechnicalSheetPanel";
import { HtmlCodeToggle } from "@/components/HtmlCodeToggle";
import { ProductLotsPanel, type ProductLotEditorRow } from "@/components/ProductLotsPanel";

/** Opzioni menù "righe in tabella": sempre 25/50/100, poi fasce fino al totale filtrato, infine Tutti. */
function buildTablePageSizeOptions(total: number): { value: string; label: string }[] {
    const milestones = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    const out: { value: string; label: string }[] = [];
    const seen = new Set<number>();
    for (const m of milestones) {
        if (m <= 100 || m <= total) {
            if (!seen.has(m)) {
                seen.add(m);
                out.push({ value: String(m), label: String(m) });
            }
        }
    }
    out.push({ value: "all", label: "Tutti" });
    return out;
}

const PRESTA_PUSH_OVERWRITE_ROWS: { key: keyof PrestaPushFieldOverwrite; label: string }[] = [
    { key: "title", label: "Titolo (tutte le lingue)" },
    { key: "description", label: "Descrizione" },
    { key: "shortDescription", label: "Descrizione breve" },
    { key: "price", label: "Prezzo" },
    { key: "ean", label: "EAN" },
    { key: "category", label: "Categoria" },
    { key: "manufacturer", label: "Produttore / marca" },
    { key: "images", label: "Immagini" },
    { key: "stock", label: "Quantità (stock)" },
    { key: "physical", label: "Peso, dimensioni e unità (unity)" },
];

/** Allineato al tetto `maxImages` lato API Presta (max 30). */
const PRESTA_MAX_IMAGE_SELECT_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));

const WOO_PUSH_OVERWRITE_ROWS: { key: keyof WooPushFieldOverwrite; label: string }[] = [
    { key: "title", label: "Titolo" },
    { key: "description", label: "Descrizione" },
    { key: "shortDescription", label: "Descrizione breve" },
    { key: "price", label: "Prezzo" },
    { key: "images", label: "Immagini" },
    { key: "categories", label: "Categorie" },
    { key: "brand", label: "Brand (attributo)" },
    { key: "stock", label: "Quantità (stock)" },
    { key: "weight", label: "Peso (campo REST, unità negozio)" },
    { key: "attributesExtra", label: "Altri attributi (materiale, dimensioni, extra)" },
    { key: "acfMeta", label: "Meta ACF (extraFields con prefisso ACF)" },
];

function allFalsePrestaPushOverwrite(): PrestaPushFieldOverwrite {
    return Object.fromEntries(
        (Object.keys(DEFAULT_PRESTA_PUSH_OVERWRITE) as (keyof PrestaPushFieldOverwrite)[]).map((k) => [k, false])
    ) as PrestaPushFieldOverwrite;
}

function allFalseWooPushOverwrite(): WooPushFieldOverwrite {
    return Object.fromEntries(
        (Object.keys(DEFAULT_WOO_PUSH_OVERWRITE) as (keyof WooPushFieldOverwrite)[]).map((k) => [k, false])
    ) as WooPushFieldOverwrite;
}

type PushFieldModalState =
    | { channel: "presta"; mode: "single"; product: any }
    | { channel: "presta"; mode: "bulk" }
    | { channel: "woo"; mode: "single"; product: any }
    | { channel: "woo"; mode: "bulk" };

type ProductEditorTab =
    | "info"
    | "images"
    | "seo"
    | "attributes"
    | "technical"
    | "lots"
    | "woocommerce"
    | "history";

const PRODUCT_EDITOR_TABS: {
    id: ProductEditorTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}[] = [
    { id: "info", label: "Generale", icon: Package },
    { id: "images", label: "Media & Asset", icon: LayoutGrid },
    { id: "seo", label: "SEO & AI Content", icon: Sparkles },
    { id: "attributes", label: "Specifiche & Bullet", icon: List },
    { id: "technical", label: "Schede tecniche", icon: FileSpreadsheet },
    { id: "lots", label: "Lotti", icon: Layers },
    { id: "woocommerce", label: "Omnichannel", icon: Globe },
    { id: "history", label: "Cronologia", icon: HistoryIcon },
];

/** Parametri push PrestaShop usabili dal modale (override rispetto al modale Omnichannel per questa esecuzione). */
type PrestaPublishSession = {
    defaultCategoryId: string;
    languageId: string;
    taxRulesGroupId: string;
    idShop: string;
    categoryParentId: string;
    syncManufacturer: boolean;
    syncCategoryFromProduct: boolean;
    uploadImages: boolean;
    maxImages: string;
    erpPriceIncludesVat: boolean;
    /** Vuoto = usa default server (conversione come kg da anagrafica). */
    erpWeightInputUnit: "" | "kg" | "g" | "lb";
};

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
    { value: "brand", label: "Brand (testo — elenco azienda)" },
    { value: "brandId", label: "Brand (FK — elenco azienda)" },
    { value: "vatCodeId", label: "Codice IVA / aliquota (FK — elenco azienda)" },
    { value: "category", label: "Categoria (testo — elenco azienda)" },
    { value: "categoryId", label: "Categoria liv. 1 (FK — elenco azienda)" },
    { value: "subCategoryId", label: "Sub categoria liv. 2 (FK — elenco azienda)" },
    { value: "subSubCategoryId", label: "Sotto-categoria liv. 3 (FK — elenco azienda)" },
    { value: "ean", label: "EAN" },
    { value: "parentSku", label: "Parent SKU" },
    { value: "title", label: "Titolo (IT)" },
    { value: "description", label: "Descrizione" },
    { value: "bulletPoints", label: "Bullet points" },
    { value: "seoAiText", label: "Descrizione breve e-commerce (HTML)" },
    { value: "price", label: "Prezzo (listino default)" },
    { value: "currency", label: "Valuta prezzo (listino default)" },
    { value: "dimensions", label: "Dimensioni (extra)" },
    { value: "weight", label: "Peso (extra)" },
    { value: "material", label: "Materiale (extra)" },
    { value: "extra:colore", label: "Colore (extra)" },
    { value: "extra:stockLocal", label: "Quantità Stock Locale (extra)" },
    { value: "extra:stockSupplier", label: "Quantità Stock Fornitore (extra)" },
    { value: "__extra_custom__", label: "Altro campo extra (chiave manuale)" }
];

/** Inserimento rapido segnaposti `{{campo}}` per modifiche massive (risolti lato API per ogni prodotto). */
const BULK_TEMPLATE_FIELD_KEYS: { token: string; label: string }[] = [
    { token: "sku", label: "SKU" },
    { token: "ean", label: "EAN" },
    { token: "parentSku", label: "Parent SKU" },
    { token: "brand", label: "Brand (testo)" },
    { token: "category", label: "Categoria (testo)" },
    { token: "brandId", label: "Brand ID" },
    { token: "categoryId", label: "Categoria liv.1 ID" },
    { token: "subCategoryId", label: "Sub categoria liv.2 ID" },
    { token: "subSubCategoryId", label: "Sotto-cat. liv.3 ID" },
    { token: "vatCodeId", label: "Codice IVA ID" },
    { token: "title", label: "Titolo (IT)" },
    { token: "description", label: "Descrizione" },
    { token: "bulletPoints", label: "Bullet" },
    { token: "seoAiText", label: "Descrizione breve e-commerce (HTML)" },
    { token: "price", label: "Prezzo" },
    { token: "currency", label: "Valuta" },
    { token: "dimensions", label: "Dimensioni (extra)" },
    { token: "weight", label: "Peso (extra)" },
    { token: "material", label: "Materiale (extra)" },
    { token: "extra:colore", label: "Extra: colore" },
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
        "bulletpoints",
        "seoaitext",
        "currency",
        "dimensions",
        "weight",
        "material",
        "vatcodeid"
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
        return "Valore; vuoto = rimuove il campo extra se presente. Usa {{sku}}, {{title}}, {{extra:stagione}}, …";
    }
    if (fpL === "vatcodeid") {
        return "Scegli un codice IVA dall’elenco; vuoto = azzera il codice sul prodotto";
    }
    return "Testo o numero; vuoto dove consentito azzera il campo. Segnaposto scheda: {{sku}}, {{title}}, {{extra:chiave}}, …";
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
    { key: "seoAiText", label: "Breve e-commerce (HTML)" },
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

type ErpTableSortKey = "sku" | "title" | "brand" | "category" | "priceIvato" | "priceNet";

/** Chiave di confronto brand (trim, NFC, minuscolo) per filtro elenco / deduplica. */
function normalizeBrandCompareKey(s: unknown): string {
    if (s == null) return "";
    const t = String(s).trim();
    if (!t) return "";
    try {
        return t.normalize("NFC").toLowerCase();
    } catch {
        return t.toLowerCase();
    }
}

/** True se il prodotto appartiene al brand scelto nel filtro (testo su riga, FK o nome da anagrafica Brand). */
function productMatchesBrandFilter(p: any, brandFilter: string, brandFilterId: number | null): boolean {
    if (!brandFilter || !String(brandFilter).trim()) return true;
    const want = normalizeBrandCompareKey(brandFilter);
    if (normalizeBrandCompareKey(p.brand) === want) return true;
    const refName = p.brandData?.name ?? p.brandRef?.name;
    if (normalizeBrandCompareKey(refName) === want) return true;
    if (brandFilterId != null && p.brandId != null && Number(p.brandId) === Number(brandFilterId)) return true;
    return false;
}

function ErpTableSortHeader({
    label,
    sortKey,
    activeKey,
    direction,
    onSort,
    className = "",
}: {
    label: string;
    sortKey: ErpTableSortKey;
    activeKey: ErpTableSortKey;
    direction: "asc" | "desc";
    onSort: (k: ErpTableSortKey) => void;
    className?: string;
}) {
    const active = activeKey === sortKey;
    return (
        <button
            type="button"
            onClick={() => onSort(sortKey)}
            title="Clicca per ordinare; un secondo clic inverte l’ordine"
            className={`inline-flex items-center gap-1 rounded-md px-0.5 -mx-0.5 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 hover:bg-slate-100/90 transition-colors cursor-pointer select-none ${className}`}
        >
            <span>{label}</span>
            <span className="inline-flex flex-col justify-center -space-y-1 shrink-0" aria-hidden>
                <ArrowUp
                    className={`w-2.5 h-2.5 ${active && direction === "asc" ? "text-slate-800" : "text-slate-300"}`}
                    strokeWidth={2.5}
                />
                <ArrowDown
                    className={`w-2.5 h-2.5 ${active && direction === "desc" ? "text-slate-800" : "text-slate-300"}`}
                    strokeWidth={2.5}
                />
            </span>
        </button>
    );
}

function formatProductLastSaveBanner(displayName: string, savedAtIso: string): string {
    const d = new Date(savedAtIso);
    if (Number.isNaN(d.getTime())) return `Ultima modifica (${displayName})`;
    const dateStr = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    const timeStr = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return `Ultima modifica (${displayName}) del ${dateStr} alle ${timeStr}`;
}

export default function ErpTable() {
    const { confirm: appConfirm, prompt: appPrompt } = useAppDialogs();
    const [products, setProducts] = useState<any[]>([]);
    const [allCategories, setAllCategories] = useState<any[]>([]);
    /** Per risolvere il nome azienda quando l’utente è admin globale (lista da /api/companies). */
    const [adminCompaniesList, setAdminCompaniesList] = useState<{ id: number; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lastProductSaveSignature, setLastProductSaveSignature] = useState<{ displayName: string; savedAt: string } | null>(null);
    const [activeTab, setActiveTab] = useState<ProductEditorTab>("info");
    const [productHistory, setProductHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [newImageUrl, setNewImageUrl] = useState("");
    const [webImages, setWebImages] = useState<string[]>([]);
    const [isSearchingWeb, setIsSearchingWeb] = useState(false);
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [isBulkWorking, setIsBulkWorking] = useState(false);
    const [allTags, setAllTags] = useState<any[]>([]);
    const [editLang, setEditLang] = useState<string>("it");
    const [isTranslating, setIsTranslating] = useState(false);
    const [isSuggestingWebTitle, setIsSuggestingWebTitle] = useState(false);
    const [isEnrichingTitle, setIsEnrichingTitle] = useState(false);
    const [productTranslations, setProductTranslations] = useState<Record<string, any>>({});
    const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
    const [attributeValues, setAttributeValues] = useState<any[]>([]);
    const [isAttributeModalOpen, setIsAttributeModalOpen] = useState(false);
    const [attributeTab, setAttributeTab] = useState<'values' | 'products'>('values');
    const [attrLoading, setAttrLoading] = useState(false);
    const [aiRespectExisting, setAiRespectExisting] = useState(true);
    const [aiUseExistingAsModel, setAiUseExistingAsModel] = useState(true);
    const [aiFastMode, setAiFastMode] = useState(true);
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

    /** Anteprima tabelle: path sotto / o data URL così com’è; URL assoluti http(s) via proxy (CORS + coerenza con /catalogues). */
    const productImageDisplaySrc = (href: string) => {
        const t = (href || "").trim();
        if (!t) return t;
        if (t.startsWith("data:") || t.startsWith("/")) return t;
        if (/^https?:\/\//i.test(t)) {
            return `/api/proxy-image?url=${encodeURIComponent(t)}`;
        }
        return t;
    };

    const CorporateImage = ({ src, alt, className }: { src: any, alt: string, className?: string }) => {
        const [error, setError] = useState(false);
        const resolvedSrc =
            typeof src === "string"
                ? src.trim()
                : String((src as any)?.url ?? (src as any)?.imageUrl ?? "").trim();
        const isInvalid = !resolvedSrc || resolvedSrc.startsWith("PAGE_REF_");
        if (error || isInvalid) return (
            <div className={`flex items-center justify-center bg-slate-50 border border-slate-100 ${className}`}>
                <Box className="w-1/3 h-1/3 text-slate-200" />
            </div>
        );
        return <img src={productImageDisplaySrc(resolvedSrc)} alt={alt} className={className} onError={() => setError(true)} />;
    };
    const [brandFilter, setBrandFilter] = useState<string>("");
    const [categoryFilter, setCategoryFilter] = useState<string | number>("all");
    const [subCategoryFilter, setSubCategoryFilter] = useState<string | number>("all");
    const [subSubCategoryFilter, setSubSubCategoryFilter] = useState<string | number>("all");
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    /** Quante righe mostrare in tabella (default 25: meno DOM; "all" = tutta la lista filtrata). */
    const [tablePageSizeStr, setTablePageSizeStr] = useState("25");
    const [tableSortKey, setTableSortKey] = useState<ErpTableSortKey>("sku");
    const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc");
    const [allBrands, setAllBrands] = useState<any[]>([]);
    const [showWooConfig, setShowWooConfig] = useState(false);
    const [wooConfig, setWooConfig] = useState({
        domain: "",
        key: "",
        secret: "",
        defaultCategoryId: "",
        categoryParentId: "",
        syncManufacturer: true,
        syncCategoryFromProduct: true,
    });
    const [psConfig, setPsConfig] = useState({
        shopUrl: "",
        apiKey: "",
        defaultCategoryId: "",
        languageId: "",
        idShop: "",
        taxRulesGroupId: "",
        categoryParentId: "",
        syncManufacturer: true,
        syncCategoryFromProduct: true,
        uploadImages: true,
        /** Listino ERP IVA inclusa → Presta riceve imponibile (campo price tax excl) */
        erpPriceIncludesVat: true,
    });
    const { data: session, status: sessionStatus } = useSession();
    const companyContext = useCompanyContext();
    const {
        startAiBulkSeoJob,
    } = useActivityContext();
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

    /** Same flags as POST /api/products full save (handleSave + persist after Presta publish). */
    const productApiSaveOverwrite = {
        category: true,
        brand: true,
        ean: true,
        parentSku: true,
        title: true,
        longDescription: true,
        bulletPoints: true,
        seoAiText: true,
        price: true,
        extras: true,
        images: true,
        lots: true,
    };

    const isGlobalAdminUser = Boolean((session?.user as any)?.isGlobalAdmin);

    const selectedCompanyLabel = useMemo(() => {
        if (effectiveCompanyId == null) return null;
        if (isGlobalAdminUser) {
            const hit = adminCompaniesList.find((c) => c.id === effectiveCompanyId);
            return hit?.name?.trim() || null;
        }
        const n = (session?.user as any)?.companyName;
        return typeof n === "string" && n.trim() ? n.trim() : null;
    }, [effectiveCompanyId, isGlobalAdminUser, session, adminCompaniesList]);

    useEffect(() => {
        if (!isGlobalAdminUser) {
            setAdminCompaniesList([]);
            return;
        }
        void axios
            .get<Array<{ id: number; name: string }>>("/api/companies")
            .then(({ data }) => setAdminCompaniesList(Array.isArray(data) ? data : []))
            .catch(() => setAdminCompaniesList([]));
    }, [isGlobalAdminUser]);

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

    const psStorageKey =
        effectiveCompanyId != null ? `pim_ps_config_${effectiveCompanyId}` : "pim_ps_config_all";

    const wooMappingStorageKey = effectiveCompanyId != null
        ? `pim_woo_mapping_v1_${effectiveCompanyId}`
        : "pim_woo_mapping_v1_all";

    const prestaPushOverwriteStorageKey =
        effectiveCompanyId != null
            ? `pim_push_overwrite_presta_${effectiveCompanyId}`
            : "pim_push_overwrite_presta_all";
    const wooPushOverwriteStorageKey =
        effectiveCompanyId != null
            ? `pim_push_overwrite_woo_${effectiveCompanyId}`
            : "pim_push_overwrite_woo_all";

    useEffect(() => {
        try {
            const rawP = localStorage.getItem(prestaPushOverwriteStorageKey);
            if (rawP) {
                const o = JSON.parse(rawP) as Partial<PrestaPushFieldOverwrite>;
                setPrestaPushOverwrite({ ...DEFAULT_PRESTA_PUSH_OVERWRITE, ...o });
            } else {
                setPrestaPushOverwrite({ ...DEFAULT_PRESTA_PUSH_OVERWRITE });
            }
        } catch {
            setPrestaPushOverwrite({ ...DEFAULT_PRESTA_PUSH_OVERWRITE });
        }
        try {
            const rawW = localStorage.getItem(wooPushOverwriteStorageKey);
            if (rawW) {
                const o = JSON.parse(rawW) as Partial<WooPushFieldOverwrite>;
                setWooPushOverwrite({ ...DEFAULT_WOO_PUSH_OVERWRITE, ...o });
            } else {
                setWooPushOverwrite({ ...DEFAULT_WOO_PUSH_OVERWRITE });
            }
        } catch {
            setWooPushOverwrite({ ...DEFAULT_WOO_PUSH_OVERWRITE });
        }
    }, [prestaPushOverwriteStorageKey, wooPushOverwriteStorageKey]);

    const [wooFields, setWooFields] = useState<string[]>([]);
    /** Letta da GET /api/integrations/woocommerce (`woocommerce_weight_unit`) dopo Testa WooCommerce. */
    const [wooShopWeightUnit, setWooShopWeightUnit] = useState<string | null>(null);
    const [isConnectingWoo, setIsConnectingWoo] = useState(false);
    const [isPublishingWoo, setIsPublishingWoo] = useState(false);
    const [isImportingWoo, setIsImportingWoo] = useState(false);
    const [isMassExportingWoo, setIsMassExportingWoo] = useState(false);
    const [psFields, setPsFields] = useState<string[]>([]);
    /** Liste da GET /api/integrations/prestashop per tendine nel modale Push. */
    const [psLanguagesList, setPsLanguagesList] = useState<{ id: string | number; name: string; iso_code?: string }[]>(
        []
    );
    const [psCategoriesList, setPsCategoriesList] = useState<{ id: number; label: string }[]>([]);
    const [psShopsList, setPsShopsList] = useState<{ id: number; name: string }[]>([]);
    const [psTaxRulesGroupsList, setPsTaxRulesGroupsList] = useState<{ id: number; label: string }[]>([]);
    const [psPrestaMetaLoading, setPsPrestaMetaLoading] = useState(false);
    /** Letta da GET /api/integrations/prestashop (`PS_WEIGHT_UNIT`) dopo Testa PrestaShop. */
    const [psShopWeightUnit, setPsShopWeightUnit] = useState<string | null>(null);
    const [isConnectingPs, setIsConnectingPs] = useState(false);
    const [isPublishingPs, setIsPublishingPs] = useState(false);
    const [isImportingPs, setIsImportingPs] = useState(false);
    const [isMassExportingPs, setIsMassExportingPs] = useState(false);
    const [isSyncingWooImages, setIsSyncingWooImages] = useState(false);
    const [isSyncingPsImages, setIsSyncingPsImages] = useState(false);
    const [isBulkAligningWooImages, setIsBulkAligningWooImages] = useState(false);
    const [isBulkAligningPsImages, setIsBulkAligningPsImages] = useState(false);
    const [isBulkTranslatingTitle, setIsBulkTranslatingTitle] = useState(false);
    const [isExportingSelectedFile, setIsExportingSelectedFile] = useState(false);
    const [showBrandsPanel, setShowBrandsPanel] = useState(false);
    const [selectedBrandForEdit, setSelectedBrandForEdit] = useState<any | null>(null);
    const [brandEditForm, setBrandEditForm] = useState({ aiContentGuidelines: "", producerDomain: "", logoUrl: "" });
    const [brandLogoInputUrl, setBrandLogoInputUrl] = useState("");
    const [isSavingBrand, setIsSavingBrand] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [showBulkSeoModal, setShowBulkSeoModal] = useState(false);
    const [bulkSeoFastMode, setBulkSeoFastMode] = useState(true);
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

    /** Traduzioni massive (lingua + campi scheda) */
    const [showBulkTranslateModal, setShowBulkTranslateModal] = useState(false);
    const [bulkTranslateTargetLang, setBulkTranslateTargetLang] = useState("en");
    const [bulkTranslateFields, setBulkTranslateFields] = useState({
        title: true,
        description: false,
        seoAiText: false,
        bulletPoints: false,
    });
    const [isBulkMassTranslating, setIsBulkMassTranslating] = useState(false);

    /** Centro modifiche massive (modale unica) */
    const [showBulkOperationsModal, setShowBulkOperationsModal] = useState(false);
    /** Import / push WooCommerce e PrestaShop */
    const [showSalesChannelsModal, setShowSalesChannelsModal] = useState(false);
    const [showWooImportWizard, setShowWooImportWizard] = useState(false);
    const [wooImportLimit, setWooImportLimit] = useState(20);
    const [wooImportOverwrite, setWooImportOverwrite] = useState({
        base: true,
        texts: true,
        price: true,
        extras: true,
        images: true,
    });
    const [wooImportWithErrors, setWooImportWithErrors] = useState(false);
    /** Woo senza SKU: genera AUTO-WOO-{id} stabile per importare e correggere dopo in Iris. */
    const [wooImportGenerateSkuForMissingWoo, setWooImportGenerateSkuForMissingWoo] = useState(false);
    /** Presta senza reference: genera AUTO-PS-{id} stabile (stesso flag API unificato `generateSkuForMissingChannelSku`). */
    const [prestaImportGenerateSkuForMissing, setPrestaImportGenerateSkuForMissing] = useState(false);
    const [wooImportMappingDraft, setWooImportMappingDraft] = useState<any | null>(null);
    const [wooImportPreview, setWooImportPreview] = useState<any | null>(null);
    const [wooImportPreviewLoading, setWooImportPreviewLoading] = useState(false);
    const [wooImportReport, setWooImportReport] = useState<any | null>(null);
    const [pushFieldModal, setPushFieldModal] = useState<PushFieldModalState | null>(null);
    const [prestaPushOverwrite, setPrestaPushOverwrite] = useState<PrestaPushFieldOverwrite>(() => ({
        ...DEFAULT_PRESTA_PUSH_OVERWRITE,
    }));
    const [wooPushOverwrite, setWooPushOverwrite] = useState<WooPushFieldOverwrite>(() => ({
        ...DEFAULT_WOO_PUSH_OVERWRITE,
    }));
    const [prestaPublishSession, setPrestaPublishSession] = useState<PrestaPublishSession>({
        defaultCategoryId: "2",
        languageId: "1",
        taxRulesGroupId: "1",
        idShop: "",
        categoryParentId: "",
        syncManufacturer: true,
        syncCategoryFromProduct: true,
        uploadImages: true,
        maxImages: "12",
        erpPriceIncludesVat: true,
        erpWeightInputUnit: "",
    });
    const [showPrestaImportModal, setShowPrestaImportModal] = useState(false);
    const [prestaImportDraft, setPrestaImportDraft] = useState({
        limit: "20",
        overwriteBase: true,
        overwriteTexts: true,
        overwritePrice: true,
        overwriteExtras: true,
        overwriteImages: true,
    });
    const [bulkOpFieldPath, setBulkOpFieldPath] = useState("brand");
    const [bulkOpExtraKey, setBulkOpExtraKey] = useState("");
    const [bulkOpValue, setBulkOpValue] = useState("");
    /** Tra un segnaposto e l’altro quando inserisci da menu (es. « · », « - », newline). */
    const [bulkTemplateSep, setBulkTemplateSep] = useState(" · ");
    const [bulkOpOnlyEmpty, setBulkOpOnlyEmpty] = useState(true);

    /** Percorso gerarchico nome categorie (stessa azienda di `allCategories`). */
    const categoryPathFn = useMemo(() => {
        const byId = new Map(allCategories.map((c: any) => [Number(c.id), c]));
        return (id: number): string => {
            const segs: string[] = [];
            let cur: any = byId.get(id);
            const guard = new Set<number>();
            while (cur != null && !guard.has(Number(cur.id))) {
                const cid = Number(cur.id);
                guard.add(cid);
                segs.unshift(String(cur.name ?? ""));
                const pid = cur.parentId != null ? Number(cur.parentId) : NaN;
                cur = Number.isFinite(pid) ? byId.get(pid) : null;
            }
            return segs.filter(Boolean).join(" › ");
        };
    }, [allCategories]);

    const bulkSelectBrandNameOptions = useMemo(() => {
        const rows = [...allBrands]
            .filter((b: any) => b?.name && String(b.name).trim())
            .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "it"));
        return rows.map((b: any) => {
            const n = String(b.name).trim();
            return { value: n, label: n };
        });
    }, [allBrands]);

    const bulkSelectBrandIdOptions = useMemo(() => {
        const rows = [...allBrands]
            .filter((b: any) => b?.id != null)
            .sort((a: any, b: any) =>
                String(a.name ?? "").localeCompare(String(b.name ?? ""), "it")
            );
        return rows.map((b: any) => ({
            value: String(b.id),
            label: `${String(b.name ?? "")} (ID ${b.id})`,
        }));
    }, [allBrands]);

    const bulkSelectCategoryTextOptions = useMemo(() => {
        const rows = [...allCategories].sort((a: any, b: any) =>
            categoryPathFn(Number(a.id)).localeCompare(categoryPathFn(Number(b.id)), "it")
        );
        return rows.map((c: any) => {
            const n = String(c.name ?? "").trim();
            return {
                value: n,
                label: `${categoryPathFn(Number(c.id))} · «${n}»`,
            };
        });
    }, [allCategories, categoryPathFn]);

    const bulkSelectCategoryIdOptions = useMemo(() => {
        const roots = allCategories.filter((c: any) => !c.parentId);
        return roots
            .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "it"))
            .map((c: any) => ({
                value: String(c.id),
                label: `${c.name} (ID ${c.id})`,
            }));
    }, [allCategories]);

    const bulkSelectSubCategoryIdOptions = useMemo(() => {
        const byId = new Map(allCategories.map((c: any) => [Number(c.id), c]));
        const lvl2 = allCategories.filter((c: any) => {
            if (c.parentId == null) return false;
            const p = byId.get(Number(c.parentId));
            return p && !p.parentId;
        });
        return lvl2
            .sort((a: any, b: any) =>
                categoryPathFn(Number(a.id)).localeCompare(categoryPathFn(Number(b.id)), "it")
            )
            .map((c: any) => ({
                value: String(c.id),
                label: `${categoryPathFn(Number(c.id))} (ID ${c.id})`,
            }));
    }, [allCategories, categoryPathFn]);

    const bulkSelectVatCodeOptions = useMemo(() => {
        return [...vatCodes]
            .sort((a, b) => String(a.code).localeCompare(String(b.code), "it"))
            .map((v) => ({
                value: String(v.id),
                label: `${v.code} — ${Number(v.ratePercent)}%${v.label ? ` (${v.label})` : ""}`,
            }));
    }, [vatCodes]);

    const bulkSelectSubSubCategoryIdOptions = useMemo(() => {
        const byId = new Map(allCategories.map((c: any) => [Number(c.id), c]));
        const lvl3 = allCategories.filter((c: any) => {
            if (c.parentId == null) return false;
            const p = byId.get(Number(c.parentId));
            if (!p || p.parentId == null) return false;
            const gp = byId.get(Number(p.parentId));
            return gp && !gp.parentId;
        });
        return lvl3
            .sort((a: any, b: any) =>
                categoryPathFn(Number(a.id)).localeCompare(categoryPathFn(Number(b.id)), "it")
            )
            .map((c: any) => ({
                value: String(c.id),
                label: `${categoryPathFn(Number(c.id))} (ID ${c.id})`,
            }));
    }, [allCategories, categoryPathFn]);

    const bulkSelectFieldKind = useMemo(() => {
        if (bulkOpFieldPath === "__extra_custom__") return null;
        const fp = bulkOpFieldPath.toLowerCase();
        if (fp === "brand") return "brandName" as const;
        if (fp === "brandid") return "brandId" as const;
        if (fp === "category") return "categoryText" as const;
        if (fp === "categoryid") return "categoryId" as const;
        if (fp === "subcategoryid") return "subCategoryId" as const;
        if (fp === "subsubcategoryid") return "subSubCategoryId" as const;
        if (fp === "vatcodeid") return "vatCodeId" as const;
        return null;
    }, [bulkOpFieldPath]);

    const bulkSelectOptionsForField = useMemo(() => {
        switch (bulkSelectFieldKind) {
            case "brandName":
                return bulkSelectBrandNameOptions;
            case "brandId":
                return bulkSelectBrandIdOptions;
            case "categoryText":
                return bulkSelectCategoryTextOptions;
            case "categoryId":
                return bulkSelectCategoryIdOptions;
            case "subCategoryId":
                return bulkSelectSubCategoryIdOptions;
            case "subSubCategoryId":
                return bulkSelectSubSubCategoryIdOptions;
            case "vatCodeId":
                return bulkSelectVatCodeOptions;
            default:
                return [];
        }
    }, [
        bulkSelectFieldKind,
        bulkSelectBrandNameOptions,
        bulkSelectBrandIdOptions,
        bulkSelectCategoryTextOptions,
        bulkSelectCategoryIdOptions,
        bulkSelectSubCategoryIdOptions,
        bulkSelectSubSubCategoryIdOptions,
        bulkSelectVatCodeOptions,
    ]);

    const bulkValueUsesEntitySelect =
        bulkSelectFieldKind != null && effectiveCompanyId != null && bulkSelectOptionsForField.length > 0;

    // Filtri avanzati (Iris)
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [aiContentFilter, setAiContentFilter] = useState<"all" | "yes" | "no" | "partial">("all");
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

    const [allCatalogs, setAllCatalogs] = useState<{ id: number; name: string }[]>([]);
    const fetchCatalogs = async () => {
        try {
            const res = await axios.get("/api/catalogues", companyReq);
            const rows = Array.isArray(res.data) ? res.data : [];
            setAllCatalogs(rows.map((c: any) => ({ id: c.id, name: c.name })));
        } catch {
            setAllCatalogs([]);
        }
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

        const wooDefaults = {
            domain: "",
            key: "",
            secret: "",
            defaultCategoryId: "",
            categoryParentId: "",
            syncManufacturer: true,
            syncCategoryFromProduct: true,
        };
        setWooConfig(wooDefaults);
        const saved = localStorage.getItem(wooStorageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as Record<string, unknown>;
                setWooConfig({
                    ...wooDefaults,
                    ...parsed,
                    syncManufacturer: parsed.syncManufacturer !== false,
                    syncCategoryFromProduct: parsed.syncCategoryFromProduct !== false,
                } as typeof wooDefaults);
            } catch {
                /* ignore */
            }
        }
        const psDefaults = {
            shopUrl: "",
            apiKey: "",
            defaultCategoryId: "",
            languageId: "",
            idShop: "",
            taxRulesGroupId: "",
            categoryParentId: "",
            syncManufacturer: true,
            syncCategoryFromProduct: true,
            uploadImages: true,
            erpPriceIncludesVat: true,
        };
        let initialPs = psDefaults;
        const psSaved = localStorage.getItem(psStorageKey);
        if (psSaved) {
            try {
                const parsed = JSON.parse(psSaved) as Record<string, unknown>;
                initialPs = {
                    ...psDefaults,
                    ...parsed,
                    syncManufacturer: parsed.syncManufacturer !== false,
                    syncCategoryFromProduct: parsed.syncCategoryFromProduct !== false,
                    uploadImages: parsed.uploadImages !== false,
                    erpPriceIncludesVat: parsed.erpPriceIncludesVat !== false,
                } as typeof psDefaults;
            } catch {
                /* ignore */
            }
        }
        setPsConfig(initialPs);
        axios
            .get<{
                wooDomain?: string;
                wooConsumerKey?: string;
                wooConsumerSecret?: string;
                prestaShopUrl?: string;
                prestaShopApiKey?: string;
                prestaShopDefaultCategoryId?: number | null;
                prestaShopLanguageId?: number | null;
                prestaShopIdShop?: number | null;
                prestaShopTaxRulesGroupId?: number | null;
            }>("/api/company/integration-settings", companyReq)
            .then(({ data }) => {
                if (data?.wooDomain != null || data?.wooConsumerKey || data?.wooConsumerSecret) {
                    setWooConfig((prev) => {
                        const next = {
                            ...prev,
                            domain: data.wooDomain ?? "",
                            key: data.wooConsumerKey ?? "",
                            secret: data.wooConsumerSecret ?? "",
                        };
                        try {
                            localStorage.setItem(wooStorageKey, JSON.stringify(next));
                        } catch {
                            /* ignore */
                        }
                        return next;
                    });
                }
                if (data?.prestaShopUrl != null || data?.prestaShopApiKey) {
                    setPsConfig((prev) => {
                        const nextPs = {
                            ...prev,
                            shopUrl: data.prestaShopUrl ?? "",
                            apiKey: data.prestaShopApiKey ?? "",
                            defaultCategoryId:
                                data.prestaShopDefaultCategoryId != null
                                    ? String(data.prestaShopDefaultCategoryId)
                                    : "",
                            languageId:
                                data.prestaShopLanguageId != null ? String(data.prestaShopLanguageId) : "",
                            idShop: data.prestaShopIdShop != null ? String(data.prestaShopIdShop) : "",
                            taxRulesGroupId:
                                data.prestaShopTaxRulesGroupId != null
                                    ? String(data.prestaShopTaxRulesGroupId)
                                    : "",
                            categoryParentId: "",
                            syncManufacturer: true,
                            syncCategoryFromProduct: true,
                            uploadImages: true,
                        };
                        try {
                            localStorage.setItem(psStorageKey, JSON.stringify(nextPs));
                        } catch {
                            /* ignore */
                        }
                        return nextPs;
                    });
                }
            })
            .catch(() => {
                /* server settings opzionali */
            });
        fetchCategories();
        fetchTags();
        fetchBrands();
        fetchCatalogs();
        fetchVatCodes();
        fetchProducts();
    }, [wooStorageKey, psStorageKey, effectiveCompanyId, sessionStatus]);

    useLayoutEffect(() => {
        if (pushFieldModal?.channel === "presta") {
            setPrestaPublishSession({
                defaultCategoryId: (psConfig.defaultCategoryId || "").trim() || "2",
                languageId: (psConfig.languageId || "").trim() || "1",
                taxRulesGroupId: (psConfig.taxRulesGroupId || "").trim() || "1",
                idShop: (psConfig.idShop || "").trim(),
                categoryParentId: (psConfig.categoryParentId || "").trim(),
                syncManufacturer: psConfig.syncManufacturer,
                syncCategoryFromProduct: psConfig.syncCategoryFromProduct,
                uploadImages: psConfig.uploadImages,
                maxImages: "12",
                erpPriceIncludesVat: psConfig.erpPriceIncludesVat,
                erpWeightInputUnit: "",
            });
        }
    }, [pushFieldModal, psConfig]);

    /** Lingue, categorie e negozi Presta per le tendine del modale Push (si aggiornano se cambi la lingua contenuti). */
    useEffect(() => {
        if (pushFieldModal?.channel !== "presta") return;
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) return;
        let cancelled = false;
        (async () => {
            setPsPrestaMetaLoading(true);
            try {
                const params: Record<string, string> = {
                    shopUrl: psConfig.shopUrl.trim(),
                    apiKey: psConfig.apiKey.trim(),
                };
                const sid = psConfig.idShop.trim();
                if (sid) params.idShop = sid;
                const lid = prestaPublishSession.languageId.trim();
                if (lid) params.labelLangId = lid;
                const res = await axios.get("/api/integrations/prestashop", { params });
                if (cancelled) return;
                setPsLanguagesList(Array.isArray(res.data.languages) ? res.data.languages : []);
                setPsCategoriesList(Array.isArray(res.data.categories) ? res.data.categories : []);
                setPsShopsList(Array.isArray(res.data.shops) ? res.data.shops : []);
                setPsTaxRulesGroupsList(
                    Array.isArray(res.data.taxRulesGroups) ? res.data.taxRulesGroups : []
                );
                setPsFields(res.data.fields || []);
                const wu =
                    res.data.weightUnit != null && String(res.data.weightUnit).trim()
                        ? String(res.data.weightUnit).trim()
                        : null;
                setPsShopWeightUnit(wu);
            } catch {
                if (!cancelled) {
                    setPsLanguagesList([]);
                    setPsCategoriesList([]);
                    setPsShopsList([]);
                    setPsTaxRulesGroupsList([]);
                }
            } finally {
                if (!cancelled) setPsPrestaMetaLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        pushFieldModal?.channel,
        psConfig.shopUrl,
        psConfig.apiKey,
        psConfig.idShop,
        prestaPublishSession.languageId,
    ]);

    useEffect(() => {
        if (showBulkOperationsModal) {
            void fetchVatCodes();
        }
    }, [showBulkOperationsModal]);

    const testWooConnection = async () => {
        setIsConnectingWoo(true);
        try {
            const res = await axios.get("/api/integrations/woocommerce", { params: wooConfig });
            setWooFields(res.data.fields || []);
            const wu =
                res.data.weightUnit != null && String(res.data.weightUnit).trim()
                    ? String(res.data.weightUnit).trim()
                    : null;
            setWooShopWeightUnit(wu);
            const wPart = wu ? ` · unità peso negozio: ${wu}` : "";
            toast.success(`Connesso! WooCommerce ha ${res.data.totalFound} prodotti (anteprima).${wPart}`);
            localStorage.setItem(wooStorageKey, JSON.stringify(wooConfig));
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Connessione fallita");
        } finally {
            setIsConnectingWoo(false);
        }
    };

    const testPsConnection = async () => {
        setIsConnectingPs(true);
        try {
            const params: Record<string, string> = {
                shopUrl: psConfig.shopUrl,
                apiKey: psConfig.apiKey,
            };
            const sid = psConfig.idShop.trim();
            if (sid) params.idShop = sid;
            const res = await axios.get("/api/integrations/prestashop", { params });
            setPsFields(res.data.fields || []);
            setPsLanguagesList(Array.isArray(res.data.languages) ? res.data.languages : []);
            setPsCategoriesList(Array.isArray(res.data.categories) ? res.data.categories : []);
            setPsShopsList(Array.isArray(res.data.shops) ? res.data.shops : []);
            setPsTaxRulesGroupsList(
                Array.isArray(res.data.taxRulesGroups) ? res.data.taxRulesGroups : []
            );
            const wu =
                res.data.weightUnit != null && String(res.data.weightUnit).trim()
                    ? String(res.data.weightUnit).trim()
                    : null;
            setPsShopWeightUnit(wu);
            const wPart = wu ? ` · unità peso negozio: ${wu}` : "";
            toast.success(`PrestaShop: letti ${res.data.totalFound} prodotti (anteprima).${wPart}`);
            localStorage.setItem(psStorageKey, JSON.stringify(psConfig));
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Connessione PrestaShop fallita");
        } finally {
            setIsConnectingPs(false);
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
            const ok = await appConfirm("Vuoi usare il mapping WooCommerce salvato (Brand/Material/Dimensions/Stock/ACF)?");
            if (ok) return savedMapping;
        }

        const brandAttr = await appPrompt(
            "Nome attributo Woo per BRAND (es. 'Brand'). Lascia vuoto per non usarlo:",
            draftMapping.brandAttributeName
        );
        if (brandAttr === null) return null;

        const materialAttr = await appPrompt(
            "Nome attributo Woo per MATERIAL (es. 'Material'). Lascia vuoto per non usarlo:",
            draftMapping.materialAttributeName
        );
        if (materialAttr === null) return null;

        const dimensionsAttr = await appPrompt(
            "Nome attributo Woo per DIMENSIONS (es. 'Dimensions'). Lascia vuoto per non usarlo:",
            draftMapping.dimensionsAttributeName
        );
        if (dimensionsAttr === null) return null;

        const extrasConfirm = await appConfirm("Mappare tutti gli altri attributi WooCommerce su ERP come 'extraFields'?");

        const stockKey = await appPrompt(
            "Dove vuoi salvare Woo stock_quantity in ERP? (scrivi stockLocal o stockSupplier)",
            draftMapping.stockQuantityERPKey
        );
        if (stockKey === null) return null;
        const normalizedStockKey =
            stockKey.toString().trim() === "stockSupplier" ? "stockSupplier" : "stockLocal";

        const acfKeysPreview = acfMetaKeys?.length ? acfMetaKeys.slice(0, 6).join(", ") : "";
        const acfImport = await appConfirm(
            "Vuoi importare in ERP (extraFields) i campi ACF di WooCommerce (meta_data con chiave che inizia 'acf_')? " +
                (acfKeysPreview ? `(esempi: ${acfKeysPreview}${acfMetaKeys.length > 6 ? "..." : ""})` : "")
        );
        const acfExport = await appConfirm(
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

    const openWooImportWizard = async () => {
        if (!ensureBrandSelected()) return;
        if (!wooConfig.domain || !wooConfig.key || !wooConfig.secret) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }
        // Carica mapping salvato + suggerimenti attributi (se disponibili)
        let attributeNames: string[] = [];
        let acfMetaKeys: string[] = [];
        try {
            const res = await axios.get("/api/integrations/woocommerce", { params: wooConfig });
            attributeNames = res.data.attributeNames || [];
            acfMetaKeys = res.data.acfMetaKeys || [];
        } catch {
            // ignore
        }

        const saved = localStorage.getItem(wooMappingStorageKey);
        const savedMapping = saved
            ? (() => {
                  try {
                      return JSON.parse(saved);
                  } catch {
                      return null;
                  }
              })()
            : null;

        const defaultPick = (needle: string, fallback: string) => {
            const match = attributeNames.find((n: string) => n.toLowerCase().includes(needle.toLowerCase()));
            if (match) return match;
            return attributeNames.includes(fallback) ? fallback : fallback;
        };

        const draft = {
            brandAttributeName: savedMapping?.brandAttributeName || defaultPick("brand", "Brand"),
            materialAttributeName: savedMapping?.materialAttributeName || defaultPick("material", "Material"),
            dimensionsAttributeName: savedMapping?.dimensionsAttributeName || defaultPick("dimension", "Dimensions"),
            extrasToERPExtraFields: savedMapping?.extrasToERPExtraFields ?? true,
            stockQuantityERPKey: savedMapping?.stockQuantityERPKey ?? "stockLocal",
            acfMetaPrefix: savedMapping?.acfMetaPrefix ?? "acf_",
            acfToERPExtraFields: savedMapping?.acfToERPExtraFields ?? true,
            _attributeNames: attributeNames,
            _acfKeysPreview: Array.isArray(acfMetaKeys) ? acfMetaKeys.slice(0, 10) : [],
        };

        setWooImportMappingDraft(draft);
        setWooImportLimit(20);
        setWooImportWithErrors(false);
        setWooImportGenerateSkuForMissingWoo(false);
        setWooImportPreview(null);
        setWooImportReport(null);
        setShowWooImportWizard(true);
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

    const publishToWoo = async (product: any, overwrite?: WooPushFieldOverwrite) => {
        if (!wooConfig.domain || !wooConfig.key) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab('woocommerce');
            return;
        }
        setIsPublishingWoo(true);
        try {
            const mapping = await ensureWooMapping();
            if (!mapping) return;

            const dWooCat = parseInt(wooConfig.defaultCategoryId, 10);
            const pWooParentRaw = wooConfig.categoryParentId.trim();
            const pWooParent =
                pWooParentRaw === ""
                    ? undefined
                    : parseInt(pWooParentRaw, 10);
            const res = await axios.post(
                "/api/integrations/woocommerce",
                {
                    domain: wooConfig.domain,
                    key: wooConfig.key,
                    secret: wooConfig.secret,
                    product,
                    ...(overwrite ? { overwrite } : {}),
                    mapping: {
                        ...mapping,
                        defaultCategoryId:
                            Number.isFinite(dWooCat) && dWooCat > 0 ? dWooCat : undefined,
                        categoryParentId:
                            pWooParentRaw !== "" && Number.isFinite(pWooParent) && pWooParent! >= 0
                                ? pWooParent
                                : undefined,
                        syncManufacturer: wooConfig.syncManufacturer,
                        syncCategoryFromProduct: wooConfig.syncCategoryFromProduct,
                        erpWeightInputUnit: "kg",
                    },
                },
                { timeout: 180000, ...companyReq }
            );
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
        // ora usa wizard (modal con mapping + anteprima)
        await openWooImportWizard();
    };

    const publishToPresta = async (
        product: any,
        overwrite?: PrestaPushFieldOverwrite,
        session?: PrestaPublishSession
    ) => {
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop (URL e chiave webservice) nelle impostazioni o nel modale Omnichannel.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        const ps = session ?? {
            defaultCategoryId: (psConfig.defaultCategoryId || "").trim() || "2",
            languageId: (psConfig.languageId || "").trim() || "1",
            taxRulesGroupId: (psConfig.taxRulesGroupId || "").trim() || "1",
            idShop: (psConfig.idShop || "").trim(),
            categoryParentId: (psConfig.categoryParentId || "").trim(),
            syncManufacturer: psConfig.syncManufacturer,
            syncCategoryFromProduct: psConfig.syncCategoryFromProduct,
            uploadImages: psConfig.uploadImages,
            maxImages: "12",
            erpPriceIncludesVat: psConfig.erpPriceIncludesVat,
            erpWeightInputUnit: "",
        };
        const maxImg = Math.min(30, Math.max(1, parseInt(ps.maxImages || "12", 10) || 12));
        setIsPublishingPs(true);
        try {
            const res = await axios.post("/api/integrations/prestashop", {
                shopUrl: psConfig.shopUrl.trim(),
                apiKey: psConfig.apiKey.trim(),
                product,
                ...(overwrite ? { overwrite } : {}),
                mapping: {
                    defaultCategoryId: parseInt(ps.defaultCategoryId, 10) || 2,
                    languageId: parseInt(ps.languageId, 10) || 1,
                    idTaxRulesGroup: ps.taxRulesGroupId.trim()
                        ? parseInt(ps.taxRulesGroupId, 10)
                        : 1,
                    idShop: ps.idShop.trim() ? parseInt(ps.idShop, 10) : undefined,
                    stockQuantityERPKey: "stockLocal",
                    syncManufacturer: ps.syncManufacturer,
                    syncCategoryFromProduct: ps.syncCategoryFromProduct,
                    categoryParentId: ps.categoryParentId.trim()
                        ? parseInt(ps.categoryParentId, 10)
                        : undefined,
                    uploadImages: ps.uploadImages,
                    maxImages: maxImg,
                    erpPriceIncludesVat: ps.erpPriceIncludesVat,
                    ...(ps.erpWeightInputUnit === "kg" ||
                    ps.erpWeightInputUnit === "g" ||
                    ps.erpWeightInputUnit === "lb"
                        ? { erpWeightInputUnit: ps.erpWeightInputUnit }
                        : {}),
                },
            }, companyReq);
            const pid = res.data?.prestashopId;
            const imgUp = res.data?.imagesUploaded ?? 0;
            const imgFail = res.data?.imagesFailed ?? 0;
            toast.success(
                pid
                    ? `PrestaShop ID ${pid} (${res.data.action || "ok"})` +
                          (imgUp + imgFail > 0 ? ` · immagini: ${imgUp} ok, ${imgFail} errori` : "") +
                          "."
                    : "Pubblicato su PrestaShop."
            );
            const merged = {
                ...product,
                extraFields: {
                    ...(product.extraFields || {}),
                    ...(pid != null ? { prestashopProductId: String(pid) } : {}),
                },
            };
            setSelectedProduct(merged);
            await axios.post(
                "/api/products",
                { ...merged, overwrite: productApiSaveOverwrite },
                companyReq
            );
            fetchProducts();
        } catch (err: any) {
            const psErr = err.response?.data;
            const psLines =
                Array.isArray(psErr?.prestashopErrors) && psErr.prestashopErrors.length
                    ? psErr.prestashopErrors.join(" · ")
                    : psErr?.error;
            toast.error(psLines || "Errore pubblicazione PrestaShop");
        } finally {
            setIsPublishingPs(false);
        }
    };

    const openPrestaImportWizard = () => {
        if (!ensureBrandSelected()) return;
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop nelle impostazioni o nel modale Omnichannel.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        setShowPrestaImportModal(true);
    };

    const runPrestaImportJob = async (
        draft: typeof prestaImportDraft,
        generateSkuForMissing: boolean
    ) => {
        const limit = parseInt(draft.limit || "20", 10);
        if (!Number.isFinite(limit) || limit <= 0) {
            toast.info("Indica un numero massimo di prodotti valido (≥ 1).");
            return;
        }
        setShowPrestaImportModal(false);
        setIsImportingPs(true);
        const toastId = toast.loading("Importazione prodotti da PrestaShop in corso...");
        try {
            const res = await axios.post(
                "/api/integrations/prestashop/import",
                {
                    shopUrl: psConfig.shopUrl.trim(),
                    apiKey: psConfig.apiKey.trim(),
                    limit,
                    generateSkuForMissingChannelSku: generateSkuForMissing,
                    generateSkuForMissingPrestaSku: generateSkuForMissing,
                    overwrite: {
                        base: draft.overwriteBase,
                        texts: draft.overwriteTexts,
                        price: draft.overwritePrice,
                        extras: draft.overwriteExtras,
                        images: draft.overwriteImages,
                    },
                    mapping: {
                        languageId: parseInt(psConfig.languageId, 10) || 1,
                        stockQuantityERPKey: "stockLocal",
                        idShop: psConfig.idShop.trim() ? parseInt(psConfig.idShop, 10) : undefined,
                    },
                },
                { ...companyReq, timeout: 300_000 }
            );
            const smr = Number(res.data?.skippedMissingReference ?? 0);
            let msg =
                `Import PrestaShop: ${res.data.created || 0} creati, ${res.data.updated || 0} aggiornati, ` +
                `${res.data.skipped || 0} saltati, ${res.data.errors || 0} errori.`;
            if (smr > 0 && !generateSkuForMissing) {
                msg += ` Di cui ${smr} senza «reference» (SKU) su Presta — attiva «SKU provvisorio AUTO-PS-id» nel modale d’import per includerli.`;
            }
            toast.update(toastId, { render: msg, type: "success", isLoading: false, autoClose: 5000 });
            fetchProducts();
        } catch (err: any) {
            const d = err.response?.data;
            const parts = [d?.error, d?.hint].filter(Boolean);
            if (d?.upstreamStatus != null) parts.push(`webservice PrestaShop HTTP ${d.upstreamStatus}`);
            if (d?.detailsSnippet && typeof d.detailsSnippet === "string") parts.push(d.detailsSnippet);
            const render =
                parts.length > 0
                    ? parts.join(" — ")
                    : d?.error || err.message || "Errore import PrestaShop";
            toast.update(toastId, {
                render,
                type: "error",
                isLoading: false,
                autoClose: 8000,
            });
        } finally {
            setIsImportingPs(false);
        }
    };

    const executeBulkPrestaPush = async (
        overwrite: PrestaPushFieldOverwrite,
        session: PrestaPublishSession
    ) => {
        const list = products.filter((p: any) => selectedIds.includes(p.id));
        if (!list.length) return;
        setIsMassExportingPs(true);
        const toastId = toast.loading("Push massivo su PrestaShop in corso...");
        let created = 0;
        let updated = 0;
        let errors = 0;
        let categoryResolveCache: Record<string, number> = {};
        let manufacturerResolveCache: Record<string, number> = {};
        const maxImg = Math.min(30, Math.max(1, parseInt(session.maxImages || "12", 10) || 12));
        const baseMapping = {
            defaultCategoryId: parseInt(session.defaultCategoryId, 10) || 2,
            languageId: parseInt(session.languageId, 10) || 1,
            idTaxRulesGroup: session.taxRulesGroupId.trim()
                ? parseInt(session.taxRulesGroupId, 10)
                : 1,
            idShop: session.idShop.trim() ? parseInt(session.idShop, 10) : undefined,
            stockQuantityERPKey: "stockLocal" as const,
            syncManufacturer: session.syncManufacturer,
            syncCategoryFromProduct: session.syncCategoryFromProduct,
            categoryParentId: session.categoryParentId.trim()
                ? parseInt(session.categoryParentId, 10)
                : undefined,
            uploadImages: session.uploadImages,
            maxImages: maxImg,
            erpPriceIncludesVat: session.erpPriceIncludesVat,
            ...(session.erpWeightInputUnit === "kg" ||
            session.erpWeightInputUnit === "g" ||
            session.erpWeightInputUnit === "lb"
                ? { erpWeightInputUnit: session.erpWeightInputUnit }
                : {}),
        };
        const psPostTimeoutMs = 180000;
        try {
            for (const prod of list) {
                try {
                    const postOnce = () =>
                        axios.post(
                            "/api/integrations/prestashop",
                            {
                                shopUrl: psConfig.shopUrl.trim(),
                                apiKey: psConfig.apiKey.trim(),
                                product: prod,
                                overwrite,
                                mapping: {
                                    ...baseMapping,
                                    categoryResolveCache,
                                    manufacturerResolveCache,
                                },
                            },
                            { timeout: psPostTimeoutMs, ...companyReq }
                        );
                    let res;
                    try {
                        res = await postOnce();
                    } catch (firstErr: any) {
                        const st = firstErr?.response?.status;
                        if (st === 502 || st === 503) {
                            await new Promise((r) => setTimeout(r, 2500));
                            res = await postOnce();
                        } else {
                            throw firstErr;
                        }
                    }
                    if (res.data?.resolveCaches) {
                        categoryResolveCache = res.data.resolveCaches.categories ?? categoryResolveCache;
                        manufacturerResolveCache =
                            res.data.resolveCaches.manufacturers ?? manufacturerResolveCache;
                    }
                    if (res.data.action === "updated") updated++;
                    else created++;
                } catch (err: any) {
                    errors++;
                    const d = err.response?.data;
                    if (d?.resolveCaches) {
                        categoryResolveCache = d.resolveCaches.categories ?? categoryResolveCache;
                        manufacturerResolveCache =
                            d.resolveCaches.manufacturers ?? manufacturerResolveCache;
                    }
                    console.error("PrestaShop mass export error:", d || err.message || err);
                }
            }
        } finally {
            toast.update(toastId, {
                render: `PrestaShop: ${created} creati, ${updated} aggiornati, ${errors} errori.`,
                type: errors ? "warning" : "success",
                isLoading: false,
                autoClose: 6000,
            });
            setIsMassExportingPs(false);
            fetchProducts();
        }
    };

    const exportSelectedToPresta = () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop nelle impostazioni o nel modale Omnichannel.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        const list = products.filter((p: any) => selectedIds.includes(p.id));
        if (!list.length) return;
        setPushFieldModal({ channel: "presta", mode: "bulk" });
    };

    const executeBulkWooPush = async (mapping: any, overwrite: WooPushFieldOverwrite) => {
        const list = products.filter((p: any) => selectedIds.includes(p.id));
        if (!list.length) return;
        setIsMassExportingWoo(true);
        const toastId = toast.loading("Push WooCommerce in corso...");
        let created = 0;
        let updated = 0;
        let errors = 0;
        let categoryResolveCache: Record<string, number> = {};
        let manufacturerResolveCache: Record<string, number> = {};
        const dWooCat = parseInt(wooConfig.defaultCategoryId, 10);
        const pWooParentRaw = wooConfig.categoryParentId.trim();
        const pWooParent =
            pWooParentRaw === ""
                ? undefined
                : parseInt(pWooParentRaw, 10);
        const baseWooMapping = {
            ...mapping,
            defaultCategoryId: Number.isFinite(dWooCat) && dWooCat > 0 ? dWooCat : undefined,
            categoryParentId:
                pWooParentRaw !== "" && Number.isFinite(pWooParent) && pWooParent! >= 0
                    ? pWooParent
                    : undefined,
            syncManufacturer: wooConfig.syncManufacturer,
            syncCategoryFromProduct: wooConfig.syncCategoryFromProduct,
            erpWeightInputUnit: "kg" as const,
        };
        const wooPostTimeoutMs = 180000;

        try {
            for (const prod of list) {
                try {
                    const postOnce = () =>
                        axios.post(
                            "/api/integrations/woocommerce",
                            {
                                domain: wooConfig.domain,
                                key: wooConfig.key,
                                secret: wooConfig.secret,
                                product: prod,
                                overwrite,
                                mapping: {
                                    ...baseWooMapping,
                                    categoryResolveCache,
                                    manufacturerResolveCache,
                                },
                            },
                            { timeout: wooPostTimeoutMs, ...companyReq }
                        );
                    let res;
                    try {
                        res = await postOnce();
                    } catch (firstErr: any) {
                        const st = firstErr?.response?.status;
                        if (st === 502 || st === 503) {
                            await new Promise((r) => setTimeout(r, 2500));
                            res = await postOnce();
                        } else {
                            throw firstErr;
                        }
                    }
                    if (res.data?.resolveCaches) {
                        categoryResolveCache = res.data.resolveCaches.categories ?? categoryResolveCache;
                        manufacturerResolveCache =
                            res.data.resolveCaches.manufacturers ?? manufacturerResolveCache;
                    }
                    if (res.data.action === "updated") updated++;
                    else created++;
                } catch (err: any) {
                    errors++;
                    const d = err.response?.data;
                    if (d?.resolveCaches) {
                        categoryResolveCache = d.resolveCaches.categories ?? categoryResolveCache;
                        manufacturerResolveCache =
                            d.resolveCaches.manufacturers ?? manufacturerResolveCache;
                    }
                    console.error("Woo mass export error:", d || err.message || err);
                }
            }
        } finally {
            toast.update(toastId, {
                render: `WooCommerce: ${created} creati, ${updated} aggiornati, ${errors} errori.`,
                type: errors ? "warning" : "success",
                isLoading: false,
                autoClose: 6000,
            });
            setIsMassExportingWoo(false);
            fetchProducts();
        }
    };

    const exportSelectedToWoo = () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }
        if (!wooConfig.domain || !wooConfig.key || !wooConfig.secret) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }
        const list = products.filter((p: any) => selectedIds.includes(p.id));
        if (!list.length) return;
        setPushFieldModal({ channel: "woo", mode: "bulk" });
    };

    const confirmPushFieldModal = async () => {
        if (!pushFieldModal) return;
        const { channel, mode } = pushFieldModal;
        try {
            if (channel === "presta") {
                localStorage.setItem(prestaPushOverwriteStorageKey, JSON.stringify(prestaPushOverwrite));
            } else {
                localStorage.setItem(wooPushOverwriteStorageKey, JSON.stringify(wooPushOverwrite));
            }
        } catch {
            /* ignore */
        }

        const singleProduct = mode === "single" ? pushFieldModal.product : null;
        const prestaSessionSnapshot =
            channel === "presta" ? { ...prestaPublishSession } : null;
        setPushFieldModal(null);

        if (channel === "presta" && mode === "single" && singleProduct) {
            await publishToPresta(
                singleProduct,
                prestaPushOverwrite,
                prestaSessionSnapshot ?? undefined
            );
            return;
        }
        if (channel === "presta" && mode === "bulk") {
            await executeBulkPrestaPush(prestaPushOverwrite, prestaSessionSnapshot!);
            return;
        }
        if (channel === "woo" && mode === "single" && singleProduct) {
            await publishToWoo(singleProduct, wooPushOverwrite);
            return;
        }
        if (channel === "woo" && mode === "bulk") {
            const mapping = await ensureWooMapping();
            if (!mapping) return;
            await executeBulkWooPush(mapping, wooPushOverwrite);
        }
    };

    const requestPrestaPushForProduct = (product: any) => {
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop (URL e chiave webservice) nelle impostazioni o nel modale Omnichannel.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        setPushFieldModal({ channel: "presta", mode: "single", product });
    };

    const requestWooPushForProduct = (product: any) => {
        if (!wooConfig.domain || !wooConfig.key) {
            toast.warning("Configura prima l'integrazione WooCommerce nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }
        setPushFieldModal({ channel: "woo", mode: "single", product });
    };

    const syncWooProductImages = async (product: any) => {
        if (!wooConfig.domain || !wooConfig.key || !wooConfig.secret) {
            toast.warning("Configura WooCommerce (dominio, chiave e secret) nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }
        if (!product?.sku) {
            toast.warning("SKU mancante: impossibile trovare il prodotto sul negozio.");
            return;
        }
        setIsSyncingWooImages(true);
        try {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const res = await axios.post(
                "/api/integrations/woocommerce/sync-images",
                {
                    domain: wooConfig.domain,
                    key: wooConfig.key,
                    secret: wooConfig.secret,
                    product,
                    publicOrigin: origin,
                    maxGalleryImages: 30,
                },
                { timeout: 300000 }
            );
            const d = res.data;
            toast.success(
                `Woo immagini: +${d.imagesAdded ?? 0} nuove, −${d.duplicateSrcRemoved ?? 0} dup. URL, −${d.duplicateByContentRemoved ?? 0} dup. stesso file. Totale in galleria: ${d.imageCount ?? "—"}.`
            );
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Errore sync immagini WooCommerce");
        } finally {
            setIsSyncingWooImages(false);
        }
    };

    const syncPrestaProductImages = async (product: any, mode: "align" | "replace" = "align") => {
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop (URL e chiave webservice) nelle impostazioni o nel modale Omnichannel.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        if (!product?.sku) {
            toast.warning("SKU mancante: impossibile trovare il prodotto su PrestaShop.");
            return;
        }
        if (!product?.id) {
            toast.warning("Salva il prodotto in ERP (ID mancante) prima di sincronizzare le immagini.");
            return;
        }
        if (mode === "replace") {
            const ok = await appConfirm(
                "Sul negozio PrestaShop verranno eliminate tutte le immagini del prodotto e caricate solo quelle presenti nella scheda ERP (ordine preservato). Continuare?"
            );
            if (!ok) return;
        }
        setIsSyncingPsImages(true);
        try {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const idShopRaw = psConfig.idShop.trim();
            const res = await axios.post(
                "/api/integrations/prestashop/sync-images",
                {
                    shopUrl: psConfig.shopUrl.trim(),
                    apiKey: psConfig.apiKey.trim(),
                    product,
                    publicOrigin: origin,
                    mode,
                    mapping: {
                        idShop: idShopRaw ? parseInt(idShopRaw, 10) : undefined,
                        maxImages: 30,
                    },
                },
                { timeout: 300000, ...companyReq }
            );
            const d = res.data;
            if (d.mode === "replace") {
                toast.success(
                    `PrestaShop: rimosse ${d.deletedOnPresta ?? 0} immagini sul negozio, caricate ${d.imagesUploaded ?? 0} dall’ERP (fallite: ${d.imagesFailed ?? 0}).`
                );
            } else {
                toast.success(
                    `PrestaShop: −${d.duplicatesRemoved ?? 0} duplicate sul negozio, +${d.importedFromPresta ?? 0} importate da Presta verso ERP, +${d.imagesUploaded ?? 0} inviate al negozio, ${d.skippedAlreadyPresent ?? 0} già allineate (stesso file).`
                );
            }
            fetchProducts();
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Errore sync immagini PrestaShop");
        } finally {
            setIsSyncingPsImages(false);
        }
    };

    const bulkAlignWooImages = async () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona almeno un prodotto in tabella.");
            return;
        }
        if (!wooConfig.domain || !wooConfig.key || !wooConfig.secret) {
            toast.warning("Configura WooCommerce (dominio, chiave e secret) nelle impostazioni.");
            setActiveTab("woocommerce");
            return;
        }
        if (selectedIds.length > 25) {
            const ok = await appConfirm(
                `Allineare le immagini su WooCommerce per ${selectedIds.length} prodotti? L'operazione può richiedere molti minuti.`
            );
            if (!ok) return;
        }
        setIsBulkAligningWooImages(true);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const toastId = toast.loading(`Woo immagini: 0/${selectedIds.length}…`);
        let okCount = 0;
        let failCount = 0;
        let skippedNoSku = 0;
        try {
            for (let i = 0; i < selectedIds.length; i++) {
                const pid = selectedIds[i];
                const p = products.find((x: any) => x.id === pid);
                if (!p?.sku) {
                    skippedNoSku++;
                    toast.update(toastId, {
                        render: `Woo immagini: ${i + 1}/${selectedIds.length} (saltati senza SKU: ${skippedNoSku})…`,
                    });
                    continue;
                }
                try {
                    await axios.post(
                        "/api/integrations/woocommerce/sync-images",
                        {
                            domain: wooConfig.domain,
                            key: wooConfig.key,
                            secret: wooConfig.secret,
                            product: p,
                            publicOrigin: origin,
                            maxGalleryImages: 30,
                        },
                        { timeout: 300000 }
                    );
                    okCount++;
                } catch {
                    failCount++;
                }
                toast.update(toastId, {
                    render: `Woo immagini: ${i + 1}/${selectedIds.length}…`,
                });
            }
            toast.dismiss(toastId);
            toast.success(
                `Woo immagini (massivo): ok ${okCount}, errori ${failCount}${
                    skippedNoSku ? `, senza SKU ${skippedNoSku}` : ""
                }.`
            );
            fetchProducts();
        } catch {
            toast.dismiss(toastId);
            toast.error("Operazione Woo immagini interrotta.");
        } finally {
            setIsBulkAligningWooImages(false);
        }
    };

    const bulkAlignPrestaImages = async () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona almeno un prodotto in tabella.");
            return;
        }
        if (effectiveCompanyId == null) {
            toast.error("Seleziona un'azienda per sincronizzare le immagini verso PrestaShop.");
            return;
        }
        if (!psConfig.shopUrl?.trim() || !psConfig.apiKey?.trim()) {
            toast.warning("Configura PrestaShop (URL e chiave webservice) nelle impostazioni.");
            setActiveTab("woocommerce");
            setShowWooConfig(true);
            return;
        }
        if (selectedIds.length > 25) {
            const ok = await appConfirm(
                `Allineare le immagini PrestaShop per ${selectedIds.length} prodotti? L'operazione può richiedere molti minuti.`
            );
            if (!ok) return;
        }
        setIsBulkAligningPsImages(true);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const idShopRaw = psConfig.idShop.trim();
        const toastId = toast.loading(`Presta immagini: 0/${selectedIds.length}…`);
        let okCount = 0;
        let failCount = 0;
        let skipped = 0;
        try {
            for (let i = 0; i < selectedIds.length; i++) {
                const pid = selectedIds[i];
                const p = products.find((x: any) => x.id === pid);
                if (!p?.sku || !p?.id) {
                    skipped++;
                    toast.update(toastId, {
                        render: `Presta immagini: ${i + 1}/${selectedIds.length} (saltati: ${skipped})…`,
                    });
                    continue;
                }
                try {
                    await axios.post(
                        "/api/integrations/prestashop/sync-images",
                        {
                            shopUrl: psConfig.shopUrl.trim(),
                            apiKey: psConfig.apiKey.trim(),
                            product: p,
                            publicOrigin: origin,
                            mode: "align" as const,
                            mapping: {
                                idShop: idShopRaw ? parseInt(idShopRaw, 10) : undefined,
                                maxImages: 30,
                            },
                        },
                        { timeout: 300000, ...companyReq }
                    );
                    okCount++;
                } catch {
                    failCount++;
                }
                toast.update(toastId, {
                    render: `Presta immagini: ${i + 1}/${selectedIds.length}…`,
                });
            }
            toast.dismiss(toastId);
            toast.success(
                `Presta immagini (massivo): ok ${okCount}, errori ${failCount}${
                    skipped ? `, saltati (SKU/ID mancante) ${skipped}` : ""
                }.`
            );
            fetchProducts();
        } catch {
            toast.dismiss(toastId);
            toast.error("Operazione Presta immagini interrotta.");
        } finally {
            setIsBulkAligningPsImages(false);
        }
    };

    const handleBulkTranslateTitle = async () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }

        const targetLang = editLang;
        const targetLabel = targetLang.toUpperCase();

        if (!(await appConfirm(`Tradurre il TITOL0 in ${targetLabel} per ${selectedIds.length} prodotti selezionati?`))) return;

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
                        headers: {
                            "Content-Type": "application/json",
                            ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                        },
                        credentials: "include",
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

    const handleBulkMassTranslate = async () => {
        if (!selectedIds.length) {
            toast.warning("Seleziona prima almeno un prodotto.");
            return;
        }
        const fieldKeys = (["title", "description", "seoAiText", "bulletPoints"] as const).filter(
            (k) => bulkTranslateFields[k]
        );
        if (fieldKeys.length === 0) {
            toast.warning("Seleziona almeno un campo da tradurre.");
            return;
        }

        const targetLang = bulkTranslateTargetLang;
        const targetLabel = targetLang.toUpperCase();
        setIsBulkMassTranslating(true);
        setShowBulkTranslateModal(false);
        const toastId = toast.loading(`Traduzione massiva (${targetLabel}): 0/${selectedIds.length}…`);

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

                const textData: Record<string, string> = {};
                if (bulkTranslateFields.title) {
                    textData.title = (p?.translations?.[sourceLang]?.title || "").toString();
                }
                if (bulkTranslateFields.description) {
                    textData.description = (p?.translations?.[sourceLang]?.description || "").toString();
                }
                if (bulkTranslateFields.seoAiText) {
                    textData.seoAiText = (p?.translations?.[sourceLang]?.seoAiText || "").toString();
                }
                if (bulkTranslateFields.bulletPoints) {
                    textData.bulletPoints = (p?.translations?.[sourceLang]?.bulletPoints || "").toString();
                }

                const anySource = Object.values(textData).some((s) => String(s).trim().length > 0);
                if (!anySource) {
                    done++;
                    toast.update(toastId, {
                        render: `Traduzione massiva (${targetLabel}): ${done}/${selectedIds.length}${
                            errors ? ` (${errors} errori)` : ""
                        }`,
                    });
                    continue;
                }

                try {
                    const body: Record<string, unknown> = {
                        textData,
                        targetLanguage: targetLang,
                    };
                    if (bulkTranslateFields.title) {
                        body.preserveTitleContext = { brand: (p.brand || "").toString() };
                    }

                    const res = await fetch("/api/ai/translate", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                        },
                        credentials: "include",
                        body: JSON.stringify(body),
                    });

                    if (!res.ok) throw new Error(await res.text());
                    const translated = await res.json();

                    const existing = p.translations?.[targetLang] || {};
                    const next: Record<string, string | null> = { ...existing };
                    if (bulkTranslateFields.title && translated?.title !== undefined) {
                        next.title = translated.title?.toString?.() ?? existing.title ?? "";
                    }
                    if (bulkTranslateFields.description && translated?.description !== undefined) {
                        next.description = translated.description?.toString?.() ?? existing.description ?? "";
                    }
                    if (bulkTranslateFields.seoAiText && translated?.seoAiText !== undefined) {
                        next.seoAiText = translated.seoAiText?.toString?.() ?? existing.seoAiText ?? "";
                    }
                    if (bulkTranslateFields.bulletPoints && translated?.bulletPoints !== undefined) {
                        next.bulletPoints = translated.bulletPoints?.toString?.() ?? existing.bulletPoints ?? "";
                    }

                    await axios.post("/api/products", {
                        sku: p.sku,
                        translations: {
                            [targetLang]: next,
                        },
                    });
                } catch (e: any) {
                    console.error("Bulk mass translate error:", e);
                    errors++;
                } finally {
                    done++;
                    toast.update(toastId, {
                        render: `Traduzione massiva (${targetLabel}): ${done}/${selectedIds.length}${
                            errors ? ` (${errors} errori)` : ""
                        }`,
                    });
                }
            }
        } finally {
            toast.update(toastId, {
                render: errors
                    ? `Traduzione massiva: completata con errori (${errors} su ${done}).`
                    : `Traduzione massiva: ${done} prodotti elaborati in ${targetLabel}.`,
                type: errors ? "warning" : "success",
                isLoading: false,
                autoClose: 6000,
            });
            setIsBulkMassTranslating(false);
            fetchProducts();
        }
    };

    const exportSelectedToFile = async (requestedFormat: "excel" | "csv") => {
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
            const { extraFields } = selectedProduct;
            const shortForAi = String(
                selectedProduct.translations?.[editLang]?.seoAiText ||
                    selectedProduct.seoAiText ||
                    ""
            );
            const aiPayload = {
                sku: selectedProduct.sku || "",
                ean: selectedProduct.ean || "",
                title:
                    selectedProduct.translations?.[editLang]?.title ||
                    selectedProduct.title ||
                    "",
                brand: selectedProduct.brand || "",
                category: selectedProduct.category || "",
                brandId: selectedProduct.brandId ?? null,
                seoAiText: aiUseExistingAsModel ? shortForAi.substring(0, 2000) : "",
                extraFieldsPreview: extraFields
                    ? Object.entries(extraFields).map(([k, v]) => `${k}: ${v}`).join(", ").substring(0, 1000)
                    : "",
            };
            const existingIt = selectedProduct.translations?.[editLang] || {};
            const targetFields = !aiRespectExisting
                ? ["short", "description", "bullets"]
                : [
                    ...(existingIt?.seoAiText ? [] : ["short"]),
                    ...(existingIt?.description ? [] : ["description"]),
                    ...(existingIt?.bulletPoints ? [] : ["bullets"]),
                ];
            if (targetFields.length === 0) {
                toast.dismiss(toastId);
                toast.info("Tutti i campi AI sono già valorizzati.");
                setIsGeneratingAI(false);
                return;
            }

            const response = await fetch("/api/ai/describe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                },
                credentials: "include",
                body: JSON.stringify({
                    productData: aiPayload,
                    language: "it",
                    options: {
                        respectExisting: aiRespectExisting,
                        useExistingAsModel: aiUseExistingAsModel,
                        fastMode: aiFastMode,
                        targetFields,
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const detail =
                    response.status === 422 && errData.code === "THIN_SOURCE"
                        ? errData.error ||
                          "Dati insufficienti: aggiungi titolo, descrizione tecnica o campi extra, oppure chiedi all’admin di impostare AI_SEO_ALLOW_THIN_SOURCE=true."
                        : errData.details || errData.error || "Errore sconosciuto dal server";
                throw new Error(`AI FAIL: ${detail}`);
            }

            const applyAiStreamChunk = (accumulated: string) => {
                const shortDescMatch = accumulated.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
                const descMatch = accumulated.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
                const bulletMatch = accumulated.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
                const fieldsMatch = accumulated.match(/---TECHNICAL_FIELDS---([\s\S]*?)$/);

                let newShortDescription = "";
                let newDescription = "";
                let newBullets = "";
                const parsedFields: Record<string, string> = {};

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
            };

            const text = await response.text();
            applyAiStreamChunk(text);

            toast.dismiss(toastId);
            toast.success("Scheda Prodotto generata!");
        } catch (error: any) {
            console.error("AI Generation Error:", error);
            toast.error("Errore di connessione o generazione: " + error.message, { toastId });
        } finally {
            setIsGeneratingAI(false);
        }
    };




    const handleBulkDelete = async () => {
        if (!(await appConfirm(`Sei sicuro di voler eliminare massivamente ${selectedIds.length} prodotti?`))) return;
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
        if (selectedIds.length === 0) return;
        if (!(await appConfirm(`Normalizzare i titoli di ${selectedIds.length} prodotti?`))) return;
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

    /** Pulizia HTML sui testi della lingua scheda (`editLang`); aggiorna anche i campi radice se IT. */
    const handleStripHtmlDescriptionsSingle = () => {
        if (!selectedProduct) return;
        const lang = editLang;
        const tt = { ...(selectedProduct.translations || {}) };
        const prev = tt[lang] || {};
        const stripped = {
            ...prev,
            description: stripHtmlToPlainText(prev.description),
            bulletPoints: stripHtmlToPlainText(prev.bulletPoints),
            seoAiText: stripHtmlToPlainText(prev.seoAiText),
        };
        tt[lang] = stripped;
        const nextProduct: any = {
            ...selectedProduct,
            translations: tt,
        };
        if (lang === "it") {
            nextProduct.description = stripped.description || "";
            nextProduct.bulletPoints = stripped.bulletPoints || "";
            nextProduct.seoAiText = stripped.seoAiText || "";
        }
        setSelectedProduct(nextProduct);
        toast.success(
            `Tag HTML rimossi per ${lang.toUpperCase()} (descrizione lunga, bullet, breve e-commerce). Salva la scheda per confermare.`
        );
    };

    /** Su DB: tutte le lingue ProductText dei prodotti selezionati. */
    const handleBulkStripHtmlDescriptions = async () => {
        if (selectedIds.length === 0) return;
        if (
            !(await appConfirm(
                `Rimuovere i tag HTML da descrizione lunga, descrizione breve e-commerce, bullet per tutte le lingue di ${selectedIds.length} prodotti selezionati?`
            ))
        ) {
            return;
        }
        setIsBulkWorking(true);
        const toastId = toast.loading("Pulizia HTML descrizioni in corso...");
        const skuOpen = selectedProduct?.sku ? String(selectedProduct.sku) : "";
        try {
            const res = await axios.post("/api/products/bulk", {
                ids: selectedIds,
                action: "strip_html_descriptions",
            });
            const n = Number(res.data?.count ?? 0);
            toast.update(toastId, {
                render:
                    n === 0
                        ? "Nessun testo modificato (già pulito o vuoto)."
                        : `Aggiornati ${n} record testi (righe lingua) con testo ripulito.`,
                type: "success",
                isLoading: false,
                autoClose: 4000,
            });
            await fetchProducts();
            if (skuOpen) {
                try {
                    const { data } = await axios.get<any>("/api/products", {
                        params: { sku: skuOpen },
                        ...companyReq,
                    });
                    const list = Array.isArray(data) ? data : [];
                    if (list[0]) setSelectedProduct(list[0]);
                } catch {
                    /* ignore refresh pannello */
                }
            }
        } catch (err) {
            toast.update(toastId, {
                render: "Errore durante la pulizia HTML delle descrizioni",
                type: "error",
                isLoading: false,
                autoClose: 4000,
            });
        } finally {
            setIsBulkWorking(false);
        }
    };

    const handleBulkAddTitlePrefix = async () => {
        if (selectedIds.length === 0) return;
        const prefix = await appPrompt("Inserisci il testo da aggiungere davanti al titolo:");
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
        if (selectedIds.length === 0) return;

        const search = await appPrompt('Testo da sostituire nel titolo (es. "IPLEX Design") - opzionale:');
        if (search === null) return;

        const replace = await appPrompt('Nuovo testo da usare / assicurare nel titolo (obbligatorio):');
        if (replace === null) return;

        const cleanReplace = replace.trim();
        if (!cleanReplace) {
            toast.info("Nessun testo valido inserito.");
            return;
        }

        const confirmMsg = search && search.trim()
            ? `Sostituire "${search}" con "${cleanReplace}" nei titoli dei ${selectedIds.length} prodotti selezionati e aggiungerlo se non presente?`
            : `Aggiungere "${cleanReplace}" ai titoli dei ${selectedIds.length} prodotti selezionati dove non presente?`;

        if (!(await appConfirm(confirmMsg))) return;

        setIsBulkWorking(true);
        const toastId = toast.loading("Aggiornamento massivo titoli (Iris) in corso...");
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
                render: "Errore durante l'aggiornamento massivo dei titoli (Iris)",
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
            .filter((p: any) => productMatchesBrandFilter(p, brandFilter, brandFilterId))
            .map((p: any) => Number(p.id))
            .filter((id: number) => Number.isInteger(id) && id > 0);

        if (targetIds.length === 0) {
            toast.info("Nessun prodotto trovato per il brand selezionato.");
            return;
        }

        if (
            !(await appConfirm(
                `Deduplicare i link immagine per il brand "${brandFilter}" su ${targetIds.length} prodotti?`
            ))
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
            !(await appConfirm(
                `Aggiungere i campi selezionati ${posLabel} per ${selectedIds.length} prodotti (lingua IT)? I valori vuoti vengono saltati.`
            ))
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
            !(await appConfirm(
                `Applicare il valore al campo selezionato su ${selectedIds.length} prodotti${
                    bulkOpOnlyEmpty ? " (solo dove il campo è vuoto)" : ""
                }?`
            ))
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
        if (selectedIds.length === 0) return;
        setShowBulkOperationsModal(false);
        setShowBulkSeoModal(false);

        const productList = products.filter((p: any) => selectedIds.includes(p.id));
        if (productList.length === 0) {
            toast.info("Nessun prodotto valido selezionato.");
            return;
        }

        const toastId = "ai-bulk-seo";
        toast.dismiss(toastId);
        toast.info(
            `Generazione SEO AI avviata in background (${productList.length} prodotti). Puoi continuare a usare l'interfaccia.`,
            { toastId, autoClose: 3500 }
        );
        if (effectiveCompanyId == null) {
            toast.error("Seleziona un'azienda prima di avviare il job.");
            return;
        }
        const inferredBrand =
            (brandFilter || "").trim() ||
            (() => {
                const uniq = new Set(
                    productList
                        .map((p: any) => String(p?.brand || "").trim())
                        .filter(Boolean)
                );
                const names = Array.from(uniq);
                return names.length === 1 ? names[0] : "";
            })();
        await startAiBulkSeoJob({
            products: productList,
            overwriteExisting,
            fastMode: bulkSeoFastMode,
            companyId: effectiveCompanyId,
            brand: inferredBrand || undefined,
            catalogue:
                productList.length > 0
                    ? (() => {
                          const c = productList.find((p: any) => p.catalogName || p.catalog?.name);
                          return c?.catalogName || c?.catalog?.name || undefined;
                      })()
                    : undefined,
            onCompleted: () => {
                fetchProducts();
            },
        });
    };

    const fetchProducts = async () => {
        if (effectiveCompanyId == null) {
            setLoading(false);
            setProducts([]);
            return;
        }
        setLoading(true);
        try {
            const rows = await fetchAllProductsPages(axios.get.bind(axios), companyReq);
            setProducts(rows);
        } catch (err: any) {
            toast.error("Errore nel caricamento del catalogo Iris");
        } finally {
            setLoading(false);
        }
    };

    const openProductEditor = (p: any) => {
        setLastProductSaveSignature(null);
        setActiveTab("info");
        setSelectedProduct({
            ...p,
            catalogLinkIds: Array.isArray(p.catalogLinkIds)
                ? [...p.catalogLinkIds]
                : (p.catalogMemberships || []).map((x: any) => x.id).filter((id: number) => id != null),
        });
    };

    const uniqueBrands = useMemo(
        () => Array.from(new Set(products.map((p: any) => p.brand).filter(Boolean))),
        [products]
    );
    const uniqueCategories = useMemo(
        () => Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))),
        [products]
    );

    const handleSave = async () => {
        if (!selectedProduct) return;
        setIsSaving(true);
        try {
            const { catalogMemberships: _catalogMemberships, catalogLinkIds, ...productRest } = selectedProduct;
            void _catalogMemberships;
            const payload = {
                ...productRest,
                vatCodeId: selectedProduct.vatCodeId ?? null,
                syncCatalogIds: Array.isArray(catalogLinkIds) ? catalogLinkIds : [],
                // POST /api/products applica molti campi sui prodotti esistenti solo se il relativo
                // flag `overwrite.*` è true (prezzo, testi IT, brand, extra, immagini, …).
                overwrite: productApiSaveOverwrite,
            };
            const { data } = await axios.post("/api/products", payload, companyReq);
            toast.success("Prodotto aggiornato con successo");
            if (data?.lastSave?.displayName && data?.lastSave?.savedAt) {
                setLastProductSaveSignature({
                    displayName: String(data.lastSave.displayName),
                    savedAt: String(data.lastSave.savedAt),
                });
            }
            if (selectedProduct?.id) {
                void fetchProductHistory(selectedProduct.id);
            }
            fetchProducts();
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
        if (alias) return String(p.extraFields[alias] ?? "");
        const candidates = STOCK_EXTRA_ALIAS_MAP[key as "stockLocal" | "stockSupplier"] || [];
        const aliasByFamily = Object.keys(p.extraFields).find((k) =>
            candidates.includes(k.toLowerCase().replace(/\s+/g, ""))
        );
        if (!aliasByFamily) return "";
        return String(p.extraFields[aliasByFamily] ?? "");
    };

    const setExtraValue = (p: any, key: string, value: string) => {
        const extras = { ...(p?.extraFields || {}) };
        const alias = Object.keys(extras).find((k) => k.toLowerCase() === key.toLowerCase());
        if (alias && alias !== key) {
            delete extras[alias];
        }
        const candidates = STOCK_EXTRA_ALIAS_MAP[key as "stockLocal" | "stockSupplier"] || [];
        for (const k of Object.keys(extras)) {
            const norm = k.toLowerCase().replace(/\s+/g, "");
            if (candidates.includes(norm) && k !== key) {
                delete extras[k];
            }
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
                headers: {
                    "Content-Type": "application/json",
                    ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                },
                credentials: "include",
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

    /** Titolo da SKU/EAN + brand/produttore + risultati web (SerpAPI) + AI testo (Gemini di default) */
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
                headers: {
                    "Content-Type": "application/json",
                    ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                },
                credentials: "include",
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
                    : isGlobalAdminUser
                      ? `Titolo generato (lingua ${editLang.toUpperCase()}). Configura SerpAPI in Impostazioni per la ricerca web.`
                      : `Titolo generato (lingua ${editLang.toUpperCase()}).`
            );
        } catch (e: any) {
            toast.dismiss(toastId);
            toast.error(e?.message || "Errore generazione titolo da web");
        } finally {
            setIsSuggestingWebTitle(false);
        }
    };

    /** Integra nel titolo (lingua corrente) dati già in scheda: bullet, misure, peso, materiale, extra — senza ricerca web. */
    const handleEnrichTitleFromScheda = async () => {
        if (!selectedProduct) return;
        setIsEnrichingTitle(true);
        const toastId = "enrich-title-scheda";
        toast.loading("Arricchimento titolo da bullet / misure / extra…", { toastId });
        try {
            const t = selectedProduct.translations?.[editLang] || {};
            const res = await fetch("/api/ai/enrich-product-title", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(effectiveCompanyId != null ? { "x-company-id": String(effectiveCompanyId) } : {}),
                },
                credentials: "include",
                body: JSON.stringify({
                    language: editLang,
                    currentTitle: (t.title || "").toString(),
                    bulletPoints: (t.bulletPoints || "").toString(),
                    description: (t.description || "").toString(),
                    seoAiText: (t.seoAiText || selectedProduct.seoAiText || "").toString(),
                    dimensions: (selectedProduct.dimensions || "").toString(),
                    weight: (selectedProduct.weight || "").toString(),
                    material: (selectedProduct.material || "").toString(),
                    brand: (selectedProduct.brand || "").toString(),
                    category: (selectedProduct.category || "").toString(),
                    extraFields:
                        selectedProduct.extraFields && typeof selectedProduct.extraFields === "object"
                            ? selectedProduct.extraFields
                            : {},
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.details || data?.error || "Errore arricchimento titolo");
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
            toast.success(`Titolo arricchito (${editLang.toUpperCase()}). Controlla e usa «Esegui Salvataggio».`);
        } catch (e: any) {
            toast.dismiss(toastId);
            toast.error(e?.message || "Errore arricchimento titolo da scheda");
        } finally {
            setIsEnrichingTitle(false);
        }
    };

    const searchWebImages = async (query: string) => {
        if (!query.trim()) return;
        setIsSearchingWeb(true);
        setWebImages([]);
        try {
            const res = await axios.get(
                `/api/search-images?q=${encodeURIComponent(query)}&shopping=true`,
                companyReq
            );
            setWebImages(res.data.images || []);
            if (res.data.images?.length === 0) {
                toast.warning(
                    isGlobalAdminUser
                        ? "Nessuna immagine trovata. Prova con SKU diverso o configura SerpAPI in Impostazioni."
                        : "Nessuna immagine trovata. Prova con un altro termine di ricerca o chiedi supporto per la configurazione."
                );
            }
        } catch (err) {
            toast.error("Errore ricerca immagini sul web");
        }
        setIsSearchingWeb(false);
    };

    const getMasterImageSlot = (slot: number): string => {
        if (!selectedProduct) return "";
        const img = selectedProduct.images?.[slot];
        return (img?.url || img?.imageUrl || "").trim();
    };

    const setMasterImageSlot = (slot: number, value: string) => {
        if (!selectedProduct) return;
        const trimmed = value.trim();
        const nextImages = [...(selectedProduct.images || [])].map((img: any) => ({ ...img }));

        while (nextImages.length <= slot) {
            nextImages.push({ id: Date.now().toString() + "-" + nextImages.length, url: "" });
        }

        if (trimmed) {
            nextImages[slot] = { ...(nextImages[slot] || {}), url: trimmed };
        } else {
            nextImages[slot] = { ...(nextImages[slot] || {}), url: "" };
        }

        const compact = nextImages.filter((img: any) => (img?.url || img?.imageUrl || "").trim() !== "");
        setSelectedProduct({ ...selectedProduct, images: compact });
    };

    const fieldContains = (needle: string, value: unknown) => {
        const n = (needle || "").trim().toLowerCase();
        if (!n) return true;
        return String(value ?? "").toLowerCase().includes(n);
    };

    const getAiContentStatus = (p: any): "SI" | "NO" | "NON COMPLETO" => {
        const shortText = String(
            p?.seoAiText ??
            p?.shortDescription ??
            p?.translations?.it?.seoAiText ??
            ""
        ).trim();
        const longText = String(
            p?.description ??
            p?.translations?.it?.description ??
            ""
        ).trim();
        const bulletsText = String(
            p?.bulletPoints ??
            p?.translations?.it?.bulletPoints ??
            ""
        ).trim();
        const count = [shortText, longText, bulletsText].filter((v) => v.length > 0).length;
        if (count === 0) return "NO";
        if (count === 3) return "SI";
        return "NON COMPLETO";
    };

    const deferredSearchTerm = useDeferredValue(searchTerm);
    /** Id anagrafica brand selezionato nel filtro (stesso record usato da import Woo / FK). */
    const brandFilterId = useMemo(() => {
        if (!brandFilter) return null;
        const want = normalizeBrandCompareKey(brandFilter);
        const row = allBrands.find((b: any) => normalizeBrandCompareKey(b?.name) === want);
        return row?.id != null ? Number(row.id) : null;
    }, [brandFilter, allBrands]);

    const filteredProducts = useMemo(() => products.filter((p: any) => {
        const term = deferredSearchTerm.toLowerCase();

        const matchesBrand = productMatchesBrandFilter(p, brandFilter, brandFilterId);
        const matchesCategory = categoryFilter === "all" || p.categoryId === Number(categoryFilter);
        const matchesSubCategory = subCategoryFilter === "all" || p.subCategoryId === Number(subCategoryFilter);
        const matchesSubSubCategory = subSubCategoryFilter === "all" || p.subSubCategoryId === Number(subSubCategoryFilter);

        if (!matchesBrand || !matchesCategory || !matchesSubCategory || !matchesSubSubCategory) return false;

        if (aiContentFilter !== "all") {
            const aiStatus = getAiContentStatus(p);
            if (aiContentFilter === "yes" && aiStatus !== "SI") return false;
            if (aiContentFilter === "no" && aiStatus !== "NO") return false;
            if (aiContentFilter === "partial" && aiStatus !== "NON COMPLETO") return false;
        }

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
            (p.brandData?.name || "").toLowerCase().includes(term) ||
            (p.brandRef?.name || "").toLowerCase().includes(term) ||
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
    }), [
        products,
        deferredSearchTerm,
        brandFilter,
        brandFilterId,
        categoryFilter,
        subCategoryFilter,
        subSubCategoryFilter,
        aiContentFilter,
        filterMissingShortDesc,
        filterMissingLongDesc,
        filterMissingImages,
        filterMissingCategory,
        filterPriceMin,
        filterPriceMax,
        filterStockMin,
        filterStockMax,
        sheetFilters,
    ]);

    const tablePageSizeChoice = useMemo((): number | "all" => {
        if (tablePageSizeStr === "all") return "all";
        const n = parseInt(tablePageSizeStr, 10);
        return Number.isFinite(n) && n > 0 ? n : 25;
    }, [tablePageSizeStr]);

    const handleTableSort = (key: ErpTableSortKey) => {
        if (tableSortKey === key) {
            setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setTableSortKey(key);
            setTableSortDir("asc");
        }
    };

    const sortedFilteredProducts = useMemo(() => {
        const out = [...filteredProducts];
        const mul = tableSortDir === "asc" ? 1 : -1;
        const cmpStr = (a: any, b: any, field: string) =>
            String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "it", { sensitivity: "base", numeric: true });
        out.sort((a: any, b: any) => {
            let cmp = 0;
            switch (tableSortKey) {
                case "sku":
                    cmp = cmpStr(a, b, "sku");
                    break;
                case "title":
                    cmp = cmpStr(a, b, "title");
                    break;
                case "brand":
                    cmp = cmpStr(a, b, "brand");
                    break;
                case "category":
                    cmp = cmpStr(a, b, "category");
                    break;
                case "priceIvato":
                    cmp =
                        (parseFloat(String(a.price ?? "0").replace(",", ".")) || 0) -
                        (parseFloat(String(b.price ?? "0").replace(",", ".")) || 0);
                    break;
                case "priceNet": {
                    const netN = (p: any) => {
                        const g = parseFloat(String(p.price ?? "0").replace(",", ".")) || 0;
                        const rate = p.vatCode?.ratePercent;
                        if (rate == null || Number(rate) < 0) return Number.NEGATIVE_INFINITY;
                        const r = Number(rate) / 100;
                        const denom = 1 + r;
                        return denom > 0 && Number.isFinite(denom) ? g / denom : Number.NEGATIVE_INFINITY;
                    };
                    cmp = netN(a) - netN(b);
                    break;
                }
                default:
                    cmp = 0;
            }
            if (cmp !== 0) return cmp * mul;
            return (Number(a.id) || 0) - (Number(b.id) || 0);
        });
        return out;
    }, [filteredProducts, tableSortKey, tableSortDir]);

    const visibleFilteredProducts = useMemo(() => {
        if (tablePageSizeChoice === "all") return sortedFilteredProducts;
        return sortedFilteredProducts.slice(0, tablePageSizeChoice);
    }, [sortedFilteredProducts, tablePageSizeChoice]);

    const tablePageSizeOptions = useMemo(
        () => buildTablePageSizeOptions(filteredProducts.length),
        [filteredProducts.length]
    );

    useEffect(() => {
        const allowed = new Set(buildTablePageSizeOptions(filteredProducts.length).map((o) => o.value));
        if (!allowed.has(tablePageSizeStr)) {
            setTablePageSizeStr("25");
        }
    }, [filteredProducts.length, tablePageSizeStr]);

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

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-[#F4F5F7] overflow-hidden">
            {/* Toolbar: sticky nel main layout se la pagina scrolla; sfondo opaco così non si vede la tabella sotto */}
            <div className="flex-none p-2 sm:p-3 pb-0 sticky top-0 z-[95] overflow-visible bg-[#F4F5F7]/98 backdrop-blur-md shadow-sm border-b border-slate-200/60 space-y-1.5 sm:space-y-2">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                    {/* Riga titolo + azienda attiva */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <HoverTooltip side="bottom" text="Iris · anagrafica e contenuti prodotti dell’azienda">
                                <div className="p-1.5 bg-[#111827] rounded-lg shadow-lg shrink-0">
                                    <Package className="w-4 h-4 text-white" aria-hidden />
                                </div>
                            </HoverTooltip>
                            <div className="min-w-0">
                                <h1 className="text-sm sm:text-base font-black text-gray-900 tracking-tight leading-none truncate">Iris</h1>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {effectiveCompanyId == null ? (
                                        <span className="inline-flex items-center gap-1.5 text-[8px] sm:text-[9px] font-black px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 uppercase tracking-widest">
                                            <AlertCircle className="w-3 h-3 shrink-0" aria-hidden />
                                            Nessuna azienda attiva
                                        </span>
                                    ) : (
                                        <span
                                            className="inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black px-2 sm:px-2.5 py-1 rounded-lg border border-indigo-300/90 bg-gradient-to-r from-indigo-50 via-white to-violet-50 text-indigo-950 shadow-[0_1px_8px_rgba(79,70,229,0.12)] ring-1 ring-indigo-100/90 truncate max-w-[min(100%,240px)] sm:max-w-md"
                                            title={
                                                selectedCompanyLabel ??
                                                `Azienda ID ${effectiveCompanyId}`
                                            }
                                        >
                                            <Building2
                                                className="w-3.5 h-3.5 text-indigo-600 shrink-0"
                                                aria-hidden
                                            />
                                            <span className="text-indigo-500 uppercase tracking-widest text-[7px] sm:text-[8px] font-black shrink-0">
                                                Azienda
                                            </span>
                                            <span className="truncate font-black text-indigo-950">
                                                {selectedCompanyLabel ?? `#${effectiveCompanyId}`}
                                            </span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <HoverTooltip side="bottom" text="Numero di prodotti nel risultato filtrato; la tabella può mostrarne di meno se scegli un limite righe.">
                                <div className="text-center px-1.5 py-0.5 bg-white/80 rounded-md border border-gray-100">
                                    <p className="text-[6px] font-black text-gray-400 uppercase leading-none">DB</p>
                                    <p className="text-[11px] font-black text-[#111827] leading-tight">
                                        {filteredProducts.length}
                                    </p>
                                    {filteredProducts.length > 0 &&
                                        tablePageSizeChoice !== "all" &&
                                        visibleFilteredProducts.length < filteredProducts.length && (
                                            <p className="text-[7px] font-bold text-slate-500 leading-tight mt-0.5">
                                                mostrati {visibleFilteredProducts.length}
                                            </p>
                                        )}
                                </div>
                            </HoverTooltip>
                            <div className="flex bg-[#F9FAFB] p-0.5 rounded-lg border border-gray-100">
                                <HoverTooltip side="bottom" text="Vista tabella: elenco con colonne (SKU, titolo, prezzo, …)">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('table')}
                                        className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white shadow text-[#111827]' : 'text-gray-400'}`}
                                        aria-label="Vista tabella"
                                    >
                                        <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                </HoverTooltip>
                                <HoverTooltip side="bottom" text="Vista griglia: schede prodotto con anteprima immagine">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow text-[#111827]' : 'text-gray-400'}`}
                                        aria-label="Vista griglia"
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                </HoverTooltip>
                            </div>
                            <HoverTooltip side="bottom" text="Pannello brand: linee guida AI, logo, dominio produttore e anagrafica marchi">
                                <button
                                    type="button"
                                    onClick={() => setShowBrandsPanel(true)}
                                    className="p-1.5 bg-white border border-slate-200 rounded-lg shrink-0"
                                    aria-label="Pannello brand"
                                >
                                    <Building2 className="w-4 h-4" />
                                </button>
                            </HoverTooltip>
                            <div className="flex items-center gap-2">
                                <HoverTooltip side="bottom" text="Impostazioni e-commerce: WooCommerce, PrestaShop, chiavi API e mapping">
                                    <button
                                        type="button"
                                        onClick={() => setShowWooConfig(true)}
                                        className="p-1.5 bg-[#111827] text-white rounded-lg shrink-0"
                                        aria-label="Impostazioni e integrazioni"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                </HoverTooltip>
                                <InfoHint text={INFO_HINTS.erp.wooSetup} />
                            </div>
                        </div>
                    </div>

                    {/* Filtri: scroll orizzontale solo sulla zona select; hint fuori da overflow-x per non ritagliare tooltip */}
                    <div className="flex flex-wrap gap-1.5 items-center min-w-0">
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide min-w-0 flex-1 items-center">
                        <div className="w-[min(100%,200px)] sm:w-[220px] shrink-0">
                            <SearchableSelect
                                compact
                                options={allBrands.map((brand: any) => ({
                                    value: brand.name,
                                    label: brand.name,
                                    subLabel: brand.id != null ? `id ${brand.id}` : undefined,
                                }))}
                                value={brandFilter}
                                onChange={(val) => {
                                    const next = (val as string) || "";
                                    setBrandFilter(next);
                                    setSelectedIds([]);
                                    if (!next) setSelectedProduct(null);
                                }}
                                placeholder="Apri e scegli un brand"
                                searchPlaceholder="Cerca per nome o numero id…"
                                showSearch={true}
                                dropdownMinWidth={280}
                            />
                        </div>
                        <div className="w-[120px] sm:w-[140px] shrink-0">
                            <SearchableSelect
                                compact
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
                        <div className="w-[100px] sm:w-[120px] shrink-0">
                            <SearchableSelect
                                compact
                                options={[{ value: 'all', label: 'Sub' }, ...allCategories.filter((c: any) => c.parentId === Number(categoryFilter)).map((c: any) => ({ value: c.id, label: c.name }))]}
                                value={subCategoryFilter === 'all' ? 'all' : Number(subCategoryFilter)}
                                onChange={(val) => { setSubCategoryFilter(val ?? 'all'); setSubSubCategoryFilter('all'); }}
                                placeholder="Sub"
                                showSearch={true}
                                disabled={categoryFilter === 'all'}
                            />
                        </div>
                        <div className="w-[90px] sm:w-[110px] shrink-0">
                            <SearchableSelect
                                compact
                                options={[{ value: 'all', label: 'Lvl 3' }, ...allCategories.filter((c: any) => c.parentId === Number(subCategoryFilter)).map((c: any) => ({ value: c.id, label: c.name }))]}
                                value={subSubCategoryFilter === 'all' ? 'all' : Number(subSubCategoryFilter)}
                                onChange={(val) => setSubSubCategoryFilter(val ?? 'all')}
                                placeholder="Liv.3"
                                showSearch={true}
                                disabled={subCategoryFilter === 'all'}
                            />
                        </div>
                        </div>

                        {/* Fuori da overflow-x-auto: altrimenti HoverTooltip/InfoHint viene ritagliato (overflow ≠ visible) */}
                        <div className="flex items-center gap-1 shrink-0 pl-1.5 ml-0.5 border-l border-slate-200/90">
                            <select
                                value={aiContentFilter}
                                onChange={(e) => setAiContentFilter(e.target.value as "all" | "yes" | "no" | "partial")}
                                title="Filtro contenuti AI"
                                className="w-[min(100vw-10rem,168px)] sm:w-[180px] h-8 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-black uppercase tracking-wide text-slate-600"
                            >
                                <option value="all">AI: tutti</option>
                                <option value="yes">AI: sì</option>
                                <option value="no">AI: no</option>
                                <option value="partial">AI: incompleto</option>
                            </select>
                            <div className="shrink-0">
                                <InfoHint side="bottom" text={INFO_HINTS.erp.aiContentFilter} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Azioni rapide (compatta) */}
                <div className="flex flex-wrap gap-1 items-center">
                    <HoverTooltip text="Import e push verso WooCommerce e PrestaShop, allineamento immagini su più prodotti selezionati">
                        <button
                            type="button"
                            onClick={() => setShowSalesChannelsModal(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-[#111827] to-slate-800 text-white rounded-lg font-black uppercase text-[9px] tracking-wide hover:from-slate-800 hover:to-black transition-all border border-slate-900"
                        >
                            <Store className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            Canali
                        </button>
                    </HoverTooltip>

                    <HoverTooltip text="Traduce il titolo (lingua scheda attuale) per tutti i prodotti selezionati tramite AI">
                        <button
                            type="button"
                            onClick={handleBulkTranslateTitle}
                            disabled={isBulkTranslatingTitle || isBulkMassTranslating || selectedIds.length === 0}
                            className="px-2.5 py-1.5 bg-white text-slate-900 rounded-lg font-black uppercase text-[9px] tracking-wide hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                        >
                            {isBulkTranslatingTitle ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" />
                            ) : (
                                `Titolo ${editLang.toUpperCase()}`
                            )}
                        </button>
                    </HoverTooltip>

                    <HoverTooltip
                        text={
                            isGlobalAdminUser
                                ? "Modale: scegli lingua di destinazione e quali campi tradurre (titolo, contenuti AI, descrizione, bullet). Per il titolo il modello preserva brand e nomi propri."
                                : "Scegli la lingua e i campi da tradurre (titolo, contenuti, descrizione, punti elenco). Per il titolo restano invariati brand e nomi propri."
                        }
                    >
                        <button
                            type="button"
                            onClick={() => {
                                if (!selectedIds.length) {
                                    toast.warning("Seleziona almeno un prodotto in tabella.");
                                    return;
                                }
                                setBulkTranslateTargetLang(editLang);
                                setShowBulkTranslateModal(true);
                            }}
                            disabled={isBulkMassTranslating || isBulkTranslatingTitle || selectedIds.length === 0}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 text-indigo-900 rounded-lg font-black uppercase text-[9px] tracking-wide hover:bg-indigo-100 transition-all border border-indigo-200 disabled:opacity-50"
                        >
                            {isBulkMassTranslating ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                            ) : (
                                <Languages className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            )}
                            Traduzioni
                        </button>
                    </HoverTooltip>

                    <HoverTooltip
                        text={
                            !brandFilter
                                ? "Seleziona un brand dal filtro per deduplicare"
                                : `Rimuove link immagine duplicati per ${brandFilter}`
                        }
                    >
                        <button
                            type="button"
                            onClick={handleDeduplicateImagesByBrand}
                            disabled={isBulkWorking || !brandFilter}
                            className="px-2.5 py-1.5 bg-white text-slate-900 rounded-lg font-black uppercase text-[9px] tracking-wide hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-50"
                        >
                            {isBulkWorking ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" />
                            ) : (
                                "Deduplica img"
                            )}
                        </button>
                    </HoverTooltip>

                    <HoverTooltip text="Modifiche massive: imposta lo stesso valore su un campo (SKU, prezzo, testi, categorie, extra…) per tutti i prodotti selezionati">
                        <button
                            type="button"
                            onClick={() => {
                                if (!selectedIds.length) {
                                    toast.warning("Seleziona almeno un prodotto in tabella.");
                                    return;
                                }
                                setShowBulkOperationsModal(true);
                            }}
                            disabled={selectedIds.length === 0}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-black uppercase text-[9px] tracking-wide hover:bg-black transition-all border border-slate-900 disabled:opacity-40"
                        >
                            <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            Massive
                        </button>
                    </HoverTooltip>
                    <HoverTooltip text="Inverte la spunta: deseleziona ciò che è selezionato tra i risultati filtrati e seleziona il resto della lista corrente">
                        <button
                            type="button"
                            onClick={invertSelectionOnFiltered}
                            disabled={filteredProducts.length === 0}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-900 rounded-lg font-black uppercase text-[9px] tracking-wide hover:bg-slate-50 transition-all border border-slate-200 disabled:opacity-40"
                        >
                            Inv. sel.
                        </button>
                    </HoverTooltip>
                </div>

                {/* Barra ricerca + filtri avanzati + righe + esportazioni (sopra la tabella) */}
                <div className="px-2 sm:px-3 py-1.5 bg-white/40 backdrop-blur-xl border border-gray-200/60 rounded-t-xl flex flex-row flex-wrap items-center gap-1.5 shadow-sm -mb-[1px] min-w-0">
                    <div className="flex-1 min-w-[min(100%,220px)]">
                        <HoverTooltip
                            side="bottom"
                            text={
                                isGlobalAdminUser
                                    ? "Filtra l’elenco per testo: SKU, titolo, brand, EAN, descrizione e valori nei campi extra (senza modificare il database)"
                                    : "Filtra l’elenco per testo: SKU, titolo, brand, EAN, descrizione e campi extra."
                            }
                        >
                            <div className="w-full">
                                <ClearableSearchInput
                                    value={searchTerm}
                                    onChange={setSearchTerm}
                                    placeholder="Cerca SKU, titolo, brand, EAN, campi extra…"
                                    className="w-full"
                                    iconClassName="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                                    inputClassName="w-full h-8 bg-white border border-gray-200 rounded-lg pl-9 pr-3 text-[12px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300"
                                    paddingRightEmpty="pr-3"
                                    paddingRightFilled="pr-9"
                                    clearButtonClassName="absolute right-0.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                />
                            </div>
                        </HoverTooltip>
                    </div>
                    <HoverTooltip text="Mostra o nascondi filtri su descrizioni, immagini, categoria, prezzo, stock e campi scheda">
                        <button
                            type="button"
                            onClick={() => setShowAdvancedFilters((v) => !v)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border text-[9px] font-black uppercase tracking-widest shrink-0 hover:bg-slate-50 h-8 ${
                                hasSheetFilters
                                    ? "border-violet-400 text-violet-700 ring-1 ring-violet-200"
                                    : "border-slate-200 text-slate-500"
                            }`}
                        >
                            <span>Filtri avanzati{hasSheetFilters ? " ●" : ""}</span>
                            <ChevronDown
                                className={`w-3 h-3 transition-transform shrink-0 ${showAdvancedFilters ? "rotate-180" : ""}`}
                            />
                        </button>
                    </HoverTooltip>
                    <div className="w-[100px] sm:w-[110px] shrink-0">
                        <select
                            value={tablePageSizeStr}
                            onChange={(e) => setTablePageSizeStr(e.target.value)}
                            title="Righe per pagina"
                            className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[9px] font-black uppercase tracking-wide text-slate-600"
                        >
                            {tablePageSizeOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center justify-end gap-1">
                            <HoverTooltip
                                side="bottom"
                                text="Esporta file Excel (.xlsx) con i prodotti attualmente selezionati in tabella"
                            >
                                <button
                                    type="button"
                                    onClick={() => void exportSelectedToFile("excel")}
                                    disabled={isExportingSelectedFile || selectedIds.length === 0}
                                    aria-label="Esporta Excel selezione"
                                    className="p-2 rounded-lg bg-white border border-slate-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {isExportingSelectedFile ? (
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <FileSpreadsheet className="w-5 h-5" />
                                    )}
                                </button>
                            </HoverTooltip>
                            <HoverTooltip
                                side="bottom"
                                text="Esporta file CSV con i prodotti attualmente selezionati in tabella (separatore compatibile con Excel)"
                            >
                                <button
                                    type="button"
                                    onClick={() => void exportSelectedToFile("csv")}
                                    disabled={isExportingSelectedFile || selectedIds.length === 0}
                                    aria-label="Esporta CSV selezione"
                                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {isExportingSelectedFile ? (
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <FileText className="w-5 h-5" />
                                    )}
                                </button>
                            </HoverTooltip>
                        </div>
                    </div>
                </div>

                {showAdvancedFilters && (
                    <div className="px-3 sm:px-5 -mt-2 mb-0 pb-2">
                        <div className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap gap-3 items-center text-[11px]">
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
                                            <span className="text-[9px] font-black uppercase text-slate-400 truncate">
                                                {label}
                                            </span>
                                            <ClearableSearchInput
                                                showSearchIcon={false}
                                                value={sheetFilters[key] ?? ""}
                                                onChange={(v) =>
                                                    setSheetFilters((prev) => ({ ...prev, [key]: v }))
                                                }
                                                className="w-full min-w-0"
                                                inputClassName="w-full min-w-0 bg-white border border-slate-200 rounded-lg pl-2 py-1.5 text-[11px] font-bold text-slate-800 placeholder:text-slate-300"
                                                paddingRightEmpty="pr-2"
                                                paddingRightFilled="pr-8"
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
                    </div>
                )}
            </div>

            {/* Dedicated Scrollable Table Area */}
            <div className="flex-1 overflow-y-auto px-2 sm:px-5 pb-5 custom-scrollbar w-full">
                <div className="bg-white shadow-sm border border-gray-200/60 rounded-b-2xl min-h-full overflow-hidden">
                    <EdgeScroll className="overflow-x-auto max-w-full w-full">
                        <table className="w-full text-left border-collapse min-w-[1120px]">
                            {/* Flawlessly docked column headers that stick to 0 of their scroll container */}
                            <thead
                                className="bg-[#F9FAFB] border-b border-gray-200 text-slate-400 sticky top-0 z-[55] shadow-sm transform-gpu"
                            >
                                <tr>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 w-8">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5 cursor-pointer"
                                            checked={
                                                visibleFilteredProducts.length > 0 &&
                                                visibleFilteredProducts.every((p: any) => selectedIds.includes(p.id))
                                            }
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    const visIds = visibleFilteredProducts.map((p: any) => p.id);
                                                    setSelectedIds((prev) => {
                                                        const s = new Set([...prev, ...visIds]);
                                                        return Array.from(s);
                                                    });
                                                } else {
                                                    const visSet = new Set(visibleFilteredProducts.map((p: any) => p.id));
                                                    setSelectedIds((prev) => prev.filter((id) => !visSet.has(id)));
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest">Immagine</th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3"
                                        aria-sort={
                                            tableSortKey === "sku"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="SKU"
                                            sortKey="sku"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3"
                                        aria-sort={
                                            tableSortKey === "title"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="Nome prodotto"
                                            sortKey="title"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3 hidden md:table-cell"
                                        aria-sort={
                                            tableSortKey === "brand"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="Brand"
                                            sortKey="brand"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3 hidden lg:table-cell"
                                        aria-sort={
                                            tableSortKey === "category"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="Categoria"
                                            sortKey="category"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3"
                                        aria-sort={
                                            tableSortKey === "priceIvato"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="Prezzo ivato"
                                            sortKey="priceIvato"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th
                                        className="px-2 sm:px-4 py-2 sm:py-3"
                                        aria-sort={
                                            tableSortKey === "priceNet"
                                                ? tableSortDir === "asc"
                                                    ? "ascending"
                                                    : "descending"
                                                : undefined
                                        }
                                    >
                                        <ErpTableSortHeader
                                            label="Prezzo netto"
                                            sortKey="priceNet"
                                            activeKey={tableSortKey}
                                            direction={tableSortDir}
                                            onSort={handleTableSort}
                                        />
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">
                                        Importato
                                    </th>
                                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-right">Azioni</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className="px-8 py-12 text-center">
                                            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" />
                                            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">Caricamento Iris…</p>
                                        </td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-8 py-12 text-center">
                                            <Box className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Nessun prodotto trovato</p>
                                        </td>
                                    </tr>
                                ) : visibleFilteredProducts.map((p: any) => (
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
                                                <CorporateImage src={p.images?.[0]} alt={p.sku} className="w-full h-full object-contain" />
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
                                                onClick={() => openProductEditor(p)}
                                                className="font-bold text-[11px] sm:text-[13px] text-gray-900 hover:text-slate-600 transition-colors text-left block leading-tight mb-0.5 sm:mb-1 line-clamp-2 sm:line-clamp-none"
                                            >
                                                {p.title || "Prodotto Senza Titolo"}
                                            </button>
                                            <div className="mb-1">
                                                {(() => {
                                                    const aiStatus = getAiContentStatus(p);
                                                    const cls =
                                                        aiStatus === "SI"
                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                            : aiStatus === "NO"
                                                            ? "bg-slate-100 text-slate-600 border-slate-200"
                                                            : "bg-amber-50 text-amber-700 border-amber-200";
                                                    return (
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${cls}`}>
                                                            AI {aiStatus}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className="text-[8px] sm:text-[9px] font-medium text-gray-400 line-clamp-1 max-w-[180px] sm:max-w-md italic">
                                                {p.seoAiText
                                                    ? (p.seoAiText.length > 100 ? `${p.seoAiText.substring(0, 100)}…` : p.seoAiText)
                                                    : p.description}
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-bold text-slate-700 hidden md:table-cell">
                                            {p.brand || p.brandData?.name || p.brandRef?.name || "—"}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">{p.category || "—"}</td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 font-black text-[10px] sm:text-xs text-[#111827] whitespace-nowrap">
                                            € {parseFloat(String(p.price || "0").replace(",", ".")).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 font-black text-[10px] sm:text-xs text-[#111827] whitespace-nowrap">
                                            {(() => {
                                                const netStr = priceNetFromGrossInclVat(p.price, p.vatCode?.ratePercent);
                                                if (netStr === "—") {
                                                    return <span className="text-gray-400 font-bold">—</span>;
                                                }
                                                return (
                                                    <>
                                                        €{" "}
                                                        {parseFloat(netStr).toLocaleString("it-IT", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-[9px] font-bold text-slate-500 whitespace-nowrap hidden lg:table-cell">
                                            {p.importedAt
                                                ? new Date(p.importedAt).toLocaleDateString("it-IT", {
                                                      day: "2-digit",
                                                      month: "2-digit",
                                                      year: "2-digit",
                                                  })
                                                : "—"}
                                        </td>
                                        <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-right">
                                            <button
                                                onClick={() => openProductEditor(p)}
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
                                        <div className="mt-1">
                                            {(() => {
                                                const aiStatus = getAiContentStatus(selectedProduct);
                                                const cls =
                                                    aiStatus === "SI"
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                        : aiStatus === "NO"
                                                        ? "bg-slate-100 text-slate-600 border-slate-200"
                                                        : "bg-amber-50 text-amber-700 border-amber-200";
                                                return (
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${cls}`}>
                                                        Elaborato contenuti AI: {aiStatus}
                                                    </span>
                                                );
                                            })()}
                                        </div>
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
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Iris</span>
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

                            {lastProductSaveSignature ? (
                                <div
                                    data-product-editor-banner
                                    className="px-4 sm:px-8 py-3.5 bg-gradient-to-r from-emerald-50 via-white to-sky-50 border-b border-emerald-100/90"
                                >
                                    <p className="text-[11px] sm:text-sm font-bold text-slate-800 leading-relaxed flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 border border-emerald-200 text-[9px] font-black uppercase tracking-widest text-emerald-900 shadow-sm shrink-0">
                                            Firma salvataggio
                                        </span>
                                        <span>{formatProductLastSaveBanner(lastProductSaveSignature.displayName, lastProductSaveSignature.savedAt)}</span>
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1.5 font-semibold">
                                        Lo storico completo è nella tab <span className="font-black text-slate-700">Storico</span> (ultime 20 revisioni con snapshot).
                                    </p>
                                </div>
                            ) : null}

                            {/* Schede a linguetta (cartella) + lingua / AI */}
                            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 px-2 sm:px-4 pt-2 pb-0 bg-gradient-to-b from-slate-200 via-slate-200/95 to-slate-200 border-b border-slate-300/80">
                                <div className="flex flex-wrap items-end gap-0 min-w-0 -mb-px pl-0.5">
                                    {PRODUCT_EDITOR_TABS.map((t) => {
                                        const Icon = t.icon;
                                        const active = activeTab === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setActiveTab(t.id)}
                                                className={[
                                                    "group relative flex items-center gap-1.5 sm:gap-2 shrink-0",
                                                    "px-2.5 sm:px-4 py-2 sm:py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-150",
                                                    "border border-b-0 first:rounded-tl-lg rounded-t-lg sm:rounded-t-xl",
                                                    "ml-[-1px] first:ml-0",
                                                    active
                                                        ? "z-[2] bg-[#F9FAFB] text-slate-900 border-slate-300/90 shadow-[0_-6px_20px_rgba(15,23,42,0.06)] pb-2.5 sm:pb-3 ring-1 ring-slate-200/60"
                                                        : "z-[1] bg-slate-300/45 text-slate-500 border-slate-400/35 hover:bg-slate-300/70 hover:text-slate-700 hover:z-[1]",
                                                ].join(" ")}
                                            >
                                                <Icon
                                                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${active ? "text-slate-800" : "text-slate-400 group-hover:text-slate-600"}`}
                                                    aria-hidden
                                                />
                                                <span className="whitespace-nowrap max-w-[9rem] sm:max-w-none truncate">{t.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center gap-3 pb-2 md:pb-2.5 pt-1 md:pt-0 overflow-x-auto shrink-0 w-full md:w-auto justify-end">
                                    <div className="flex shrink-0 bg-white/90 p-1 rounded-xl border border-slate-300/60 shadow-sm">
                                        {["it", "en", "fr", "de", "es"].map((lang: string) => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => setEditLang(lang)}
                                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                                    editLang === lang
                                                        ? "bg-slate-900 text-white shadow-md"
                                                        : "text-slate-500 hover:text-slate-800"
                                                }`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleTranslateProduct}
                                        disabled={isTranslating}
                                        className="px-3 sm:px-4 py-2 bg-blue-600 text-white border border-blue-700/30 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm shrink-0"
                                    >
                                        {isTranslating ? (
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Languages className="w-3 h-3" />
                                        )}
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
                                                                <HoverTooltip
                                                                    text={
                                                                        isGlobalAdminUser
                                                                            ? "Usa SKU, EAN, brand e risultati web (SerpAPI se configurato) per proporre un titolo con AI."
                                                                            : "Usa SKU, EAN e brand per proporre un titolo con AI; la ricerca web dipende dalla configurazione in Impostazioni."
                                                                    }
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleSuggestWebTitle()}
                                                                        disabled={isSuggestingWebTitle || isEnrichingTitle}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-violet-50 text-violet-800 border border-violet-100 hover:bg-violet-100 disabled:opacity-50"
                                                                    >
                                                                        {isSuggestingWebTitle ? (
                                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                                        ) : (
                                                                            <Globe className="w-3 h-3" />
                                                                        )}
                                                                        Titolo da web
                                                                    </button>
                                                                </HoverTooltip>
                                                                <HoverTooltip text="Integra nel titolo bullet, dimensioni, peso, materiale e campi extra già presenti (nessuna ricerca web).">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleEnrichTitleFromScheda()}
                                                                        disabled={isEnrichingTitle || isSuggestingWebTitle}
                                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-900 border border-emerald-100 hover:bg-emerald-100 disabled:opacity-50"
                                                                    >
                                                                        {isEnrichingTitle ? (
                                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                                        ) : (
                                                                            <Wand2 className="w-3 h-3" />
                                                                        )}
                                                                        Arricchisci titolo
                                                                    </button>
                                                                </HoverTooltip>
                                                                <span className="text-[8px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase">Nome globale</span>
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

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                                                        <div>
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 flex items-center gap-2">
                                                                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                                                                Data importazione
                                                            </div>
                                                            <p className="text-sm font-bold text-slate-700 px-1">
                                                                {selectedProduct.importedAt
                                                                    ? new Date(selectedProduct.importedAt).toLocaleString("it-IT", {
                                                                          day: "2-digit",
                                                                          month: "2-digit",
                                                                          year: "numeric",
                                                                          hour: "2-digit",
                                                                          minute: "2-digit",
                                                                      })
                                                                    : "—"}
                                                            </p>
                                                            <p className="text-[9px] text-slate-400 font-semibold mt-1 px-1">
                                                                Impostata dagli import file o dal push da Import Lab.
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 flex items-center gap-2">
                                                                <Layers className="w-3.5 h-3.5 text-slate-400" />
                                                                Cataloghi PDF
                                                            </div>
                                                            <MultiSearchableSelect
                                                                options={allCatalogs.map((c) => ({ value: c.id, label: c.name }))}
                                                                value={selectedProduct.catalogLinkIds || []}
                                                                onChange={(ids) =>
                                                                    setSelectedProduct({ ...selectedProduct, catalogLinkIds: ids })
                                                                }
                                                                placeholder="Nessun catalogo — opzionale"
                                                            />
                                                            <p className="text-[9px] text-slate-400 font-semibold mt-1">
                                                                Opzionale: collega il prodotto a uno o più cataloghi. Salva per applicare.
                                                            </p>
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
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Stato scheda</label>
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
                                                            value={getExtraValue(selectedProduct, "stockLocal") || selectedProduct.stock || 0}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                const n = parseInt(v || "0", 10);
                                                                const withStock = { ...selectedProduct, stock: Number.isNaN(n) ? 0 : n };
                                                                setSelectedProduct(setExtraValue(withStock, "stockLocal", v));
                                                            }}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-black text-gray-900 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 mb-2 block">Quantità Stock Fornitore</label>
                                                        <input
                                                            type="number"
                                                            value={getExtraValue(selectedProduct, "stockSupplier")}
                                                            onChange={e => setSelectedProduct(setExtraValue(selectedProduct, "stockSupplier", e.target.value))}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-black text-gray-900 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-slate-900 p-8 rounded-3xl shadow-lg text-white space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <RefreshCw className="w-5 h-5 text-blue-200" />
                                                    <h5 className="font-black uppercase tracking-widest text-xs">Insight</h5>
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
                                            <div className="mb-4 space-y-3">
                                                <input
                                                    type="text"
                                                    value={ambientPrompt}
                                                    onChange={e => setAmbientPrompt(e.target.value)}
                                                    placeholder="Es. cucina, tavola apparecchiata, bagno..."
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                                />
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-800">
                                                            OpenAI (gpt-image)
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                if (!selectedProduct?.id) return;
                                                                const toastId = toast.loading("Generazione foto ambientata (OpenAI)...");
                                                                try {
                                                                    const res = await axios.post(
                                                                        `/api/products/${selectedProduct.id}/ambient-image`,
                                                                        { prompt: ambientPrompt || undefined }
                                                                    );
                                                                    const img = res.data?.image;
                                                                    if (img?.url) {
                                                                        const newImages = [
                                                                            ...(selectedProduct.images || []),
                                                                            { id: img.id, url: img.url },
                                                                        ];
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
                                                                        render:
                                                                            err?.response?.data?.error ||
                                                                            "Errore durante la generazione della foto ambientata.",
                                                                        type: "error",
                                                                        isLoading: false,
                                                                        autoClose: 4000,
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 flex items-center justify-center gap-2"
                                                        >
                                                            <Sparkles className="w-4 h-4" />
                                                            Foto ambientata AI
                                                        </button>
                                                    </div>
                                                    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 space-y-3">
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-900">
                                                            Nano Banana (Gemini)
                                                        </p>
                                                        <p className="text-[10px] text-amber-950/80 leading-relaxed">
                                                            Immagini aggiuntive ambientate con il modello immagine Google (richiede chiave Gemini in
                                                            impostazioni azienda).
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                if (!selectedProduct?.id) return;
                                                                const toastId = toast.loading("Generazione foto ambientata (Nano Banana / Gemini)...");
                                                                try {
                                                                    const res = await axios.post(
                                                                        `/api/products/${selectedProduct.id}/ambient-image-gemini`,
                                                                        { prompt: ambientPrompt || undefined }
                                                                    );
                                                                    const img = res.data?.image;
                                                                    if (img?.url) {
                                                                        const newImages = [
                                                                            ...(selectedProduct.images || []),
                                                                            { id: img.id, url: img.url },
                                                                        ];
                                                                        setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                        toast.update(toastId, {
                                                                            render: "Foto Nano Banana generata e aggiunta.",
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
                                                                        render:
                                                                            err?.response?.data?.error ||
                                                                            "Errore durante la generazione Nano Banana.",
                                                                        type: "error",
                                                                        isLoading: false,
                                                                        autoClose: 4000,
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-700 flex items-center justify-center gap-2"
                                                        >
                                                            <Sparkles className="w-4 h-4" />
                                                            Genera con Nano Banana
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {Array.from({ length: 5 }).map((_, idx) => (
                                                    <div key={"master-img-slot-" + idx} className="space-y-1">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                            Link immagine {idx + 1}
                                                        </label>
                                                        <input
                                                            type="url"
                                                            value={getMasterImageSlot(idx)}
                                                            onChange={(e) => setMasterImageSlot(idx, e.target.value)}
                                                            placeholder={"https://.../immagine-" + (idx + 1) + ".jpg"}
                                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                                                    selectedProduct.images.map((img: any, i: number) => (
                                                        <div
                                                            key={img.id || i}
                                                            className="group relative aspect-square rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 shadow-sm hover:border-blue-300 transition-all cursor-zoom-in"
                                                            onClick={() =>
                                                                setZoomImageUrl(
                                                                    String(img?.url ?? img?.imageUrl ?? "").trim()
                                                                )
                                                            }
                                                        >
                                                            <CorporateImage src={img} alt={selectedProduct.sku} className="w-full h-full object-contain p-2" />
                                                            <HoverTooltip text="Rimuovi immagine" className="absolute top-1.5 right-1.5 z-10">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newImages = selectedProduct.images.filter((_: any, idx: number) => idx !== i);
                                                                        setSelectedProduct({ ...selectedProduct, images: newImages });
                                                                    }}
                                                                    className="w-6 h-6 rounded-full bg-white/90 border border-slate-200 text-slate-500 hover:bg-red-500 hover:text-white hover:border-red-500 flex items-center justify-center text-[10px] font-black shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </HoverTooltip>
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
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrizione breve e-commerce — Woo short_description / Presta description_short (HTML) ({editLang})</label>
                                                        <button
                                                            onClick={handleGenerateAIDescription}
                                                            disabled={isGeneratingAI}
                                                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.1em] hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
                                                        >
                                                            {isGeneratingAI ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                                            Genera con AI
                                                        </button>
                                                    </div>
                                                    <div className="mb-3 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={aiFastMode}
                                                                onChange={(e) => setAiFastMode(e.target.checked)}
                                                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
                                                            />
                                                            Modalita Fast (piu veloce)
                                                        </label>
                                                    </div>
                                                    <HtmlCodeToggle
                                                        value={selectedProduct.translations?.[editLang]?.seoAiText || ""}
                                                        onChange={(v) => {
                                                            const tt = { ...selectedProduct.translations };
                                                            if (!tt[editLang]) tt[editLang] = {};
                                                            tt[editLang].seoAiText = v;
                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                        }}
                                                        minHeight={120}
                                                        className="mb-6"
                                                        placeholder="Breve HTML per scheda prodotto (stesso campo esportato verso WooCommerce / PrestaShop)…"
                                                    />
                                                    <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                                                            Copywriting E-commerce (Lungo) ({editLang})
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={handleStripHtmlDescriptionsSingle}
                                                            title="Rimuove tag HTML da descrizione lunga, bullet e descrizione breve e-commerce per questa lingua"
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-200 transition-all shrink-0"
                                                        >
                                                            <Eraser className="w-3.5 h-3.5" />
                                                            Rimuovi HTML
                                                        </button>
                                                    </div>
                                                    <HtmlCodeToggle
                                                        value={selectedProduct.translations?.[editLang]?.description || ""}
                                                        onChange={(v) => {
                                                            const tt = { ...selectedProduct.translations };
                                                            if (!tt[editLang]) tt[editLang] = {};
                                                            tt[editLang].description = v;
                                                            setSelectedProduct({ ...selectedProduct, translations: tt });
                                                        }}
                                                        minHeight={300}
                                                        placeholder="Descrizione e-commerce (anche HTML)…"
                                                    />
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
                                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Dati catalogo</span>
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

                                {activeTab === "technical" && selectedProduct && (
                                    <TechnicalSheetPanel
                                        selectedProduct={selectedProduct}
                                        setSelectedProduct={setSelectedProduct}
                                        getExtraValue={getExtraValue}
                                        setExtraValue={setExtraValue}
                                        companyReq={companyReq}
                                    />
                                )}

                                {activeTab === "lots" && selectedProduct && (
                                    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                                        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
                                                <Layers className="w-3.5 h-3.5 text-slate-500" />
                                                Lotti e giacenze
                                            </h4>
                                            <ProductLotsPanel
                                                lots={
                                                    Array.isArray(selectedProduct.lots)
                                                        ? (selectedProduct.lots as ProductLotEditorRow[])
                                                        : []
                                                }
                                                onChange={(next) =>
                                                    setSelectedProduct({ ...selectedProduct, lots: next })
                                                }
                                            />
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
                                                    <p className="text-sm font-bold text-slate-400 mt-1 max-w-sm">
                                                        Pubblica su WooCommerce e PrestaShop 9: lo SKU ERP = riferimento (reference) in PrestaShop.
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 relative z-10">
                                                <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">WooID Association</p>
                                                    <p className="font-mono text-2xl font-black text-slate-900 tracking-tight">{selectedProduct.wooId || "NOT_SYNCED"}</p>
                                                </div>
                                                <div className="bg-white border border-slate-100 p-8 rounded-3xl shadow-sm">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">PrestaShop ID</p>
                                                    <p className="font-mono text-2xl font-black text-violet-900 tracking-tight">
                                                        {selectedProduct.extraFields?.prestashopProductId || "NOT_SYNCED"}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <button
                                                        onClick={() => requestWooPushForProduct(selectedProduct)}
                                                        disabled={isPublishingWoo}
                                                        className="bg-[#111827] text-white p-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-black transition-all shadow-xl disabled:opacity-50"
                                                    >
                                                        {isPublishingWoo ? (
                                                            <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                                                        ) : (
                                                            "Push WooCommerce"
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => requestPrestaPushForProduct(selectedProduct)}
                                                        disabled={isPublishingPs}
                                                        className="bg-violet-900 text-white p-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] hover:bg-violet-950 transition-all shadow-xl disabled:opacity-50"
                                                    >
                                                        {isPublishingPs ? (
                                                            <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                                                        ) : (
                                                            "Push PrestaShop"
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void syncWooProductImages(selectedProduct)}
                                                        disabled={isSyncingWooImages}
                                                        className="bg-white text-slate-800 border border-slate-200 p-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {isSyncingWooImages ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <ImagePlus className="w-4 h-4 text-slate-600" />
                                                        )}
                                                        Sync solo immagini (Woo)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void syncPrestaProductImages(selectedProduct, "align")}
                                                        disabled={isSyncingPsImages}
                                                        className="bg-white text-violet-900 border border-violet-200 p-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] hover:bg-violet-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {isSyncingPsImages ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <ImagePlus className="w-4 h-4 text-violet-600" />
                                                        )}
                                                        Allinea immagini (Presta ↔ ERP)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void syncPrestaProductImages(selectedProduct, "replace")}
                                                        disabled={isSyncingPsImages}
                                                        className="bg-white text-rose-800 border border-rose-200 p-4 rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] hover:bg-rose-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {isSyncingPsImages ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4 text-rose-600" />
                                                        )}
                                                        Presta: solo immagini ERP
                                                    </button>
                                                </div>
                                            </div>

                                            <p className="relative z-10 mt-4 text-[10px] text-slate-500 leading-relaxed max-w-3xl">
                                                <span className="font-bold text-slate-600">Allinea:</span> su Presta elimina
                                                duplicati (stesso file via hash), importa verso l&apos;ERP le foto presenti solo
                                                sul negozio, poi carica dall&apos;ERP ciò che manca sul negozio.
                                                <span className="font-bold text-slate-600"> Solo immagini ERP:</span> elimina
                                                tutte le immagini del prodotto su Presta e ricarica unicamente l&apos;elenco
                                                della scheda ERP. Su Woo: come prima (duplicati + mancanti).
                                                Serve che il prodotto esista sul canale (stesso SKU). URL relativi usano
                                                l&apos;origine del browser.
                                            </p>

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
                                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                                                                            {entry.data?.savedByDisplayName
                                                                                ? `Salvato da ${entry.data.savedByDisplayName} · revisione registrata`
                                                                                : "Snapshot salvato dopo modifica"}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        void (async () => {
                                                                            if (
                                                                                await appConfirm(
                                                                                    "Sei sicuro di voler ripristinare questa versione? Tutti i cambiamenti attuali non salvati andranno persi."
                                                                                )
                                                                            ) {
                                                                                setSelectedProduct({ ...selectedProduct, ...entry.data });
                                                                                toast.success("Versione ripristinata con successo! Premi 'Esegui Salvataggio' per confermare.");
                                                                            }
                                                                        })();
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
                                className="relative bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden"
                            >
                                <div className="p-8 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Omnichannel · Connessioni</h3>
                                        <p className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mt-1">
                                            WooCommerce REST + PrestaShop 9 webservice
                                        </p>
                                    </div>
                                    <button onClick={() => setShowWooConfig(false)} className="p-3 bg-white border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all shadow-sm">
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                <div className="p-10 space-y-10 max-h-[85vh] overflow-y-auto custom-scrollbar">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">WooCommerce</p>
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
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID categoria default Woo
                                                </label>
                                                <input
                                                    value={wooConfig.defaultCategoryId}
                                                    onChange={(e) =>
                                                        setWooConfig({
                                                            ...wooConfig,
                                                            defaultCategoryId: e.target.value,
                                                        })
                                                    }
                                                    placeholder="Se sync categoria off o senza categoria ERP"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID genitore (nuove categorie)
                                                </label>
                                                <input
                                                    value={wooConfig.categoryParentId}
                                                    onChange={(e) =>
                                                        setWooConfig({
                                                            ...wooConfig,
                                                            categoryParentId: e.target.value,
                                                        })
                                                    }
                                                    placeholder="Vuoto = 0 (radice Woo)"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 font-mono text-sm"
                                                />
                                                <p className="text-[9px] text-slate-500 mt-1">
                                                    Usato solo se la categoria ERP non esiste ancora su WooCommerce.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-6 text-[11px] font-bold text-slate-600">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={wooConfig.syncManufacturer}
                                                    onChange={(e) =>
                                                        setWooConfig({
                                                            ...wooConfig,
                                                            syncManufacturer: e.target.checked,
                                                        })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Crea termine brand (attributo globale)
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={wooConfig.syncCategoryFromProduct}
                                                    onChange={(e) =>
                                                        setWooConfig({
                                                            ...wooConfig,
                                                            syncCategoryFromProduct: e.target.checked,
                                                        })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Crea / collega categoria da scheda prodotto
                                            </label>
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
                                    {wooShopWeightUnit && (
                                        <p className="text-[11px] leading-snug text-emerald-900 font-semibold bg-emerald-50/90 border border-emerald-100 rounded-xl px-4 py-2.5">
                                            Unità peso negozio WooCommerce:{" "}
                                            <span className="font-mono font-black">{wooShopWeightUnit}</span>
                                            . Il push invia il campo <span className="font-mono">weight</span> già
                                            convertito (scheda Iris in kg di default).
                                        </p>
                                    )}

                                    <button
                                        onClick={testWooConnection}
                                        disabled={isConnectingWoo}
                                        className="w-full py-5 bg-[#111827] text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {isConnectingWoo ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                                        Testa WooCommerce
                                    </button>
                                    </div>

                                    <div className="border-t border-gray-100 pt-10 space-y-6">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-violet-700 mb-2">PrestaShop 9</p>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                URL negozio (senza /api)
                                            </label>
                                            <input
                                                type="text"
                                                value={psConfig.shopUrl}
                                                onChange={(e) => setPsConfig({ ...psConfig, shopUrl: e.target.value })}
                                                placeholder="https://negozio.tld"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-violet-100 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                Chiave webservice
                                            </label>
                                            <input
                                                type="password"
                                                value={psConfig.apiKey}
                                                onChange={(e) => setPsConfig({ ...psConfig, apiKey: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm focus:outline-none focus:ring-4 focus:ring-violet-100 transition-all"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID categoria default
                                                </label>
                                                <input
                                                    value={psConfig.defaultCategoryId}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, defaultCategoryId: e.target.value })
                                                    }
                                                    placeholder="es. 2"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID lingua
                                                </label>
                                                <input
                                                    value={psConfig.languageId}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, languageId: e.target.value })
                                                    }
                                                    placeholder="es. 1"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID negozio (multistore)
                                                </label>
                                                <input
                                                    value={psConfig.idShop}
                                                    onChange={(e) => setPsConfig({ ...psConfig, idShop: e.target.value })}
                                                    placeholder="Opzionale"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    Gruppo tasse (ID)
                                                </label>
                                                <input
                                                    value={psConfig.taxRulesGroupId}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, taxRulesGroupId: e.target.value })
                                                    }
                                                    placeholder="Vuoto = 1"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[#111827] ml-1 mb-2 block">
                                                    ID categoria padre (nuove categorie su PS)
                                                </label>
                                                <input
                                                    value={psConfig.categoryParentId}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, categoryParentId: e.target.value })
                                                    }
                                                    placeholder="Vuoto = 2 (Home tipica PrestaShop)"
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 font-mono text-sm"
                                                />
                                                <p className="text-[9px] text-slate-500 mt-1">
                                                    Usato solo se la categoria prodotto non esiste ancora sul negozio.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-6 text-[11px] font-bold text-slate-600">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={psConfig.syncManufacturer}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, syncManufacturer: e.target.checked })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Crea / collega produttore da brand
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={psConfig.syncCategoryFromProduct}
                                                    onChange={(e) =>
                                                        setPsConfig({
                                                            ...psConfig,
                                                            syncCategoryFromProduct: e.target.checked,
                                                        })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Crea / collega categoria da scheda prodotto
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={psConfig.uploadImages}
                                                    onChange={(e) =>
                                                        setPsConfig({ ...psConfig, uploadImages: e.target.checked })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Carica immagini da ERP
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={psConfig.erpPriceIncludesVat}
                                                    onChange={(e) =>
                                                        setPsConfig({
                                                            ...psConfig,
                                                            erpPriceIncludesVat: e.target.checked,
                                                        })
                                                    }
                                                    className="rounded border-gray-300"
                                                />
                                                Listino ERP IVA inclusa → prezzo Presta senza IVA
                                            </label>
                                        </div>
                                        {psFields.length > 0 && (
                                            <div className="p-6 bg-violet-50 border border-violet-100 rounded-3xl">
                                                <p className="text-[10px] font-black text-violet-800 uppercase mb-3">
                                                    Campioni campi prodotto JSON
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {psFields.slice(0, 12).map((f: string) => (
                                                        <span
                                                            key={f}
                                                            className="text-[9px] font-bold bg-white px-2 py-1 rounded-lg border border-violet-200 text-violet-700 uppercase italic"
                                                        >
                                                            {f}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {psShopWeightUnit && (
                                            <p className="text-[11px] leading-snug text-violet-950 font-semibold bg-violet-50/90 border border-violet-100 rounded-xl px-4 py-2.5">
                                                Unità peso negozio PrestaShop (<span className="font-mono">PS_WEIGHT_UNIT</span>
                                                ): <span className="font-mono font-black">{psShopWeightUnit}</span>. Nel modale
                                                push puoi indicare se il peso in scheda è in kg, g o lb; viene normalizzato a
                                                questa unità.
                                            </p>
                                        )}
                                        <button
                                            onClick={testPsConnection}
                                            disabled={isConnectingPs}
                                            className="w-full py-5 bg-violet-900 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl hover:bg-violet-950 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {isConnectingPs ? (
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <Globe className="w-5 h-5" />
                                            )}
                                            Testa PrestaShop
                                        </button>
                                    </div>
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

            <AnimatePresence>
                {showSalesChannelsModal && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowSalesChannelsModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full border border-gray-100 max-h-[min(90vh,560px)] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start gap-3 mb-5">
                                <div className="p-3 bg-slate-900 rounded-xl shrink-0">
                                    <Store className="w-6 h-6 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-gray-900 leading-tight">
                                        Pubblicazione e canali di vendita
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Scegli un&apos;azione. Import richiede brand selezionato dove indicato.
                                    </p>
                                </div>
                            </div>

                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">WooCommerce</p>
                            <div className="flex flex-col gap-2 mb-4">
                                <HoverTooltip
                                    className="w-full"
                                    text="Scarica prodotti dal negozio Woo in Iris (serve brand selezionato nel filtro)"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSalesChannelsModal(false);
                                            void importFromWoo();
                                        }}
                                        disabled={
                                            isImportingWoo ||
                                            !brandFilter ||
                                            !wooConfig.domain ||
                                            !wooConfig.key ||
                                            !wooConfig.secret
                                        }
                                        className="w-full py-3 px-4 rounded-xl border border-emerald-200 bg-emerald-50/80 text-emerald-950 font-bold text-sm text-left hover:bg-emerald-100 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                    >
                                        <span>Import da WooCommerce</span>
                                        {isImportingWoo ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Globe className="w-4 h-4 text-emerald-700 shrink-0" />}
                                    </button>
                                </HoverTooltip>
                                <HoverTooltip
                                    className="w-full"
                                    text="Invia al negozio Woo i prodotti selezionati in tabella (secondo mapping e opzioni push)"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSalesChannelsModal(false);
                                            void exportSelectedToWoo();
                                        }}
                                        disabled={
                                            isMassExportingWoo ||
                                            selectedIds.length === 0 ||
                                            !wooConfig.domain ||
                                            !wooConfig.key ||
                                            !wooConfig.secret
                                        }
                                        className="w-full py-3 px-4 rounded-xl bg-emerald-800 text-white font-bold text-sm text-left hover:bg-emerald-900 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                    >
                                        <span>Push verso WooCommerce ({selectedIds.length} selezionati)</span>
                                        {isMassExportingWoo ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0 opacity-90" />}
                                    </button>
                                </HoverTooltip>
                            </div>

                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-800 mb-2">PrestaShop</p>
                            <label className="flex items-start gap-2 text-xs font-semibold text-amber-950 mb-2 px-0.5">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={prestaImportGenerateSkuForMissing}
                                    onChange={(e) => setPrestaImportGenerateSkuForMissing(e.target.checked)}
                                />
                                <span>
                                    Senza <span className="font-mono">reference</span> su Presta: genera SKU provvisorio{" "}
                                    <span className="font-mono">AUTO-PS-id</span> (id prodotto Presta), modificabile in Iris.
                                </span>
                            </label>
                            <div className="flex flex-col gap-2">
                                <HoverTooltip text="Importa prodotti da PrestaShop in Iris (serve brand selezionato)" className="w-full">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSalesChannelsModal(false);
                                            void openPrestaImportWizard();
                                        }}
                                        disabled={
                                            isImportingPs ||
                                            !brandFilter ||
                                            !psConfig.shopUrl?.trim() ||
                                            !psConfig.apiKey?.trim()
                                        }
                                        className="w-full py-3 px-4 rounded-xl border border-violet-200 bg-violet-50/90 text-violet-950 font-bold text-sm text-left hover:bg-violet-100 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                    >
                                        <span>Import da PrestaShop</span>
                                        {isImportingPs ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <ShoppingCart className="w-4 h-4 text-violet-700 shrink-0" />}
                                    </button>
                                </HoverTooltip>
                                <HoverTooltip
                                    className="w-full"
                                    text="Pubblica su PrestaShop i prodotti selezionati (SKU = reference)"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSalesChannelsModal(false);
                                            void exportSelectedToPresta();
                                        }}
                                        disabled={
                                            isMassExportingPs ||
                                            selectedIds.length === 0 ||
                                            !psConfig.shopUrl?.trim() ||
                                            !psConfig.apiKey?.trim()
                                        }
                                        className="w-full py-3 px-4 rounded-xl bg-violet-900 text-white font-bold text-sm text-left hover:bg-violet-950 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                    >
                                        <span>Push verso PrestaShop ({selectedIds.length} selezionati)</span>
                                        {isMassExportingPs ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0 opacity-90" />}
                                    </button>
                                </HoverTooltip>
                            </div>

                            <div className="border-t border-gray-100 pt-5 mt-5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-1">
                                    Allineamento immagini (selezione)
                                </p>
                                <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                                    Stessa logica della scheda prodotto: Woo deduplica e aggiunge dalla galleria ERP; Presta
                                    deduplica sul negozio, importa verso ERP le foto solo sul negozio e invia le mancanti.
                                    Richiede prodotti selezionati in tabella e SKU presente sul canale.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <HoverTooltip
                                        className="w-full"
                                        text="Per ogni riga selezionata: deduplica immagini su Woo e aggiunge dalla galleria ERP (stesso endpoint della scheda singola)"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowSalesChannelsModal(false);
                                                void bulkAlignWooImages();
                                            }}
                                            disabled={
                                                selectedIds.length === 0 ||
                                                isBulkAligningWooImages ||
                                                isBulkAligningPsImages ||
                                                !wooConfig.domain ||
                                                !wooConfig.key ||
                                                !wooConfig.secret
                                            }
                                            className="w-full py-3 px-4 rounded-xl border border-emerald-300/80 bg-white text-emerald-950 font-bold text-sm text-left hover:bg-emerald-50/80 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                        >
                                            <span>Allinea immagini WooCommerce ({selectedIds.length})</span>
                                            {isBulkAligningWooImages ? (
                                                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                                            ) : (
                                                <ImagePlus className="w-4 h-4 text-emerald-700 shrink-0" />
                                            )}
                                        </button>
                                    </HoverTooltip>
                                    <HoverTooltip
                                        className="w-full"
                                        text="Per ogni riga selezionata: allinea immagini Presta↔ERP (dedup, import foto solo sul negozio, upload mancanti)"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowSalesChannelsModal(false);
                                                void bulkAlignPrestaImages();
                                            }}
                                            disabled={
                                                selectedIds.length === 0 ||
                                                isBulkAligningWooImages ||
                                                isBulkAligningPsImages ||
                                                !psConfig.shopUrl?.trim() ||
                                                !psConfig.apiKey?.trim() ||
                                                effectiveCompanyId == null
                                            }
                                            className="w-full py-3 px-4 rounded-xl border border-violet-300/80 bg-white text-violet-950 font-bold text-sm text-left hover:bg-violet-50/80 transition disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                        >
                                            <span>Allinea immagini PrestaShop ({selectedIds.length})</span>
                                            {isBulkAligningPsImages ? (
                                                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                                            ) : (
                                                <ImagePlus className="w-4 h-4 text-violet-700 shrink-0" />
                                            )}
                                        </button>
                                    </HoverTooltip>
                                </div>
                            </div>

                            <HoverTooltip text="Chiudi la finestra senza eseguire azioni" className="w-full">
                                <button
                                    type="button"
                                    onClick={() => setShowSalesChannelsModal(false)}
                                    className="w-full mt-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800"
                                >
                                    Chiudi
                                </button>
                            </HoverTooltip>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showWooImportWizard && wooImportMappingDraft && (
                    <div className="fixed inset-0 z-[118] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowWooImportWizard(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-3xl w-full border border-gray-100 max-h-[min(92vh,760px)] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-gray-900 leading-tight">
                                        Import WooCommerce — mapping, anteprima e report
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Imposta mapping campi, fai un’anteprima e scegli cosa sovrascrivere. Il report finale è
                                        scaricabile.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowWooImportWizard(false)}
                                    className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200"
                                >
                                    Chiudi
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Mapping attributi Woo → Iris
                                        </p>

                                        {Array.isArray(wooImportMappingDraft._attributeNames) &&
                                        wooImportMappingDraft._attributeNames.length ? (
                                            <>
                                                <label className="block space-y-1">
                                                    <span className="text-xs font-bold text-slate-700">Attributo Brand</span>
                                                    <select
                                                        value={wooImportMappingDraft.brandAttributeName}
                                                        onChange={(e) =>
                                                            setWooImportMappingDraft((p: any) => ({
                                                                ...p,
                                                                brandAttributeName: e.target.value,
                                                            }))
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                                    >
                                                        {wooImportMappingDraft._attributeNames.map((n: string) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="block space-y-1">
                                                    <span className="text-xs font-bold text-slate-700">Attributo Material</span>
                                                    <select
                                                        value={wooImportMappingDraft.materialAttributeName}
                                                        onChange={(e) =>
                                                            setWooImportMappingDraft((p: any) => ({
                                                                ...p,
                                                                materialAttributeName: e.target.value,
                                                            }))
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                                    >
                                                        {wooImportMappingDraft._attributeNames.map((n: string) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="block space-y-1">
                                                    <span className="text-xs font-bold text-slate-700">Attributo Dimensioni</span>
                                                    <select
                                                        value={wooImportMappingDraft.dimensionsAttributeName}
                                                        onChange={(e) =>
                                                            setWooImportMappingDraft((p: any) => ({
                                                                ...p,
                                                                dimensionsAttributeName: e.target.value,
                                                            }))
                                                        }
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                                    >
                                                        {wooImportMappingDraft._attributeNames.map((n: string) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </>
                                        ) : (
                                            <p className="text-sm font-semibold text-slate-600">
                                                Non sono riuscito a leggere l’elenco attributi da Woo: puoi comunque importare, ma
                                                i nomi attributo resteranno quelli di default (Brand/Material/Dimensions).
                                            </p>
                                        )}

                                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={!!wooImportMappingDraft.extrasToERPExtraFields}
                                                onChange={(e) =>
                                                    setWooImportMappingDraft((p: any) => ({
                                                        ...p,
                                                        extrasToERPExtraFields: e.target.checked,
                                                    }))
                                                }
                                            />
                                            Importa gli altri attributi Woo come extraFields
                                        </label>

                                        <label className="block space-y-1">
                                            <span className="text-xs font-bold text-slate-700">Stock Woo → extraFields</span>
                                            <select
                                                value={wooImportMappingDraft.stockQuantityERPKey}
                                                onChange={(e) =>
                                                    setWooImportMappingDraft((p: any) => ({
                                                        ...p,
                                                        stockQuantityERPKey: e.target.value === "stockSupplier" ? "stockSupplier" : "stockLocal",
                                                    }))
                                                }
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                            >
                                                <option value="stockLocal">stockLocal</option>
                                                <option value="stockSupplier">stockSupplier</option>
                                            </select>
                                        </label>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className="block space-y-1">
                                                <span className="text-xs font-bold text-slate-700">Prefix ACF</span>
                                                <input
                                                    value={wooImportMappingDraft.acfMetaPrefix}
                                                    onChange={(e) =>
                                                        setWooImportMappingDraft((p: any) => ({
                                                            ...p,
                                                            acfMetaPrefix: e.target.value,
                                                        }))
                                                    }
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                                                />
                                            </label>
                                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mt-6">
                                                <input
                                                    type="checkbox"
                                                    checked={!!wooImportMappingDraft.acfToERPExtraFields}
                                                    onChange={(e) =>
                                                        setWooImportMappingDraft((p: any) => ({
                                                            ...p,
                                                            acfToERPExtraFields: e.target.checked,
                                                        }))
                                                    }
                                                />
                                                Importa ACF → extraFields
                                            </label>
                                        </div>
                                        {Array.isArray(wooImportMappingDraft._acfKeysPreview) &&
                                            wooImportMappingDraft._acfKeysPreview.length > 0 && (
                                                <p className="text-xs text-slate-500">
                                                    ACF keys trovate (esempi):{" "}
                                                    <span className="font-semibold">{wooImportMappingDraft._acfKeysPreview.join(", ")}</span>
                                                </p>
                                            )}

                                        <div className="flex gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const toSave = { ...wooImportMappingDraft };
                                                    delete (toSave as any)._attributeNames;
                                                    delete (toSave as any)._acfKeysPreview;
                                                    localStorage.setItem(wooMappingStorageKey, JSON.stringify(toSave));
                                                    toast.success("Mapping Woo salvato.");
                                                }}
                                                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-black"
                                            >
                                                Salva mapping
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    localStorage.removeItem(wooMappingStorageKey);
                                                    toast.info("Mapping Woo rimosso (si useranno i default).");
                                                }}
                                                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest hover:bg-slate-50"
                                            >
                                                Reset mapping
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                            Opzioni import
                                        </p>
                                        <label className="block space-y-1">
                                            <span className="text-xs font-bold text-emerald-950">Limite prodotti</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={500}
                                                value={wooImportLimit}
                                                onChange={(e) => setWooImportLimit(parseInt(e.target.value, 10) || 20)}
                                                className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold"
                                            />
                                        </label>

                                        <div className="grid grid-cols-2 gap-2 text-sm font-semibold text-emerald-950">
                                            {(["base", "texts", "price", "extras", "images"] as const).map((k) => (
                                                <label key={k} className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={(wooImportOverwrite as any)[k]}
                                                        onChange={(e) =>
                                                            setWooImportOverwrite((p) => ({ ...p, [k]: e.target.checked }))
                                                        }
                                                    />
                                                    Sovrascrivi {k}
                                                </label>
                                            ))}
                                        </div>

                                        <label className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                                            <input
                                                type="checkbox"
                                                checked={wooImportWithErrors}
                                                onChange={(e) => setWooImportWithErrors(e.target.checked)}
                                            />
                                            Importa anche prodotti con errori/avvisi (dove possibile)
                                        </label>
                                        <label className="flex items-start gap-2 text-sm font-semibold text-amber-950">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 shrink-0"
                                                checked={wooImportGenerateSkuForMissingWoo}
                                                onChange={(e) => setWooImportGenerateSkuForMissingWoo(e.target.checked)}
                                            />
                                            <span>
                                                Prodotti Woo <span className="font-black">senza SKU</span>: genera uno SKU
                                                provvisorio stabile <span className="font-mono text-xs">AUTO-WOO-</span>
                                                <span className="font-mono text-xs font-black">id_Woo</span> (es.{" "}
                                                <span className="font-mono text-xs">AUTO-WOO-4856</span>) così restano
                                                importabili; stesso id Woo = stesso codice al re-import. Modificabile in Iris.
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                Anteprima import
                                            </p>
                                            <button
                                                type="button"
                                                disabled={wooImportPreviewLoading}
                                                onClick={async () => {
                                                    setWooImportPreviewLoading(true);
                                                    setWooImportPreview(null);
                                                    try {
                                                        const res = await axios.post(
                                                            "/api/integrations/woocommerce/import-preview",
                                                            {
                                                                ...wooConfig,
                                                                limit: wooImportLimit,
                                                                generateSkuForMissingChannelSku: wooImportGenerateSkuForMissingWoo,
                                                                generateSkuForMissingWooSku: wooImportGenerateSkuForMissingWoo,
                                                                mapping: {
                                                                    ...wooImportMappingDraft,
                                                                },
                                                            },
                                                            { ...companyReq, timeout: 120000 }
                                                        );
                                                        setWooImportPreview(res.data);
                                                        toast.success("Anteprima pronta.");
                                                    } catch (err: any) {
                                                        toast.error(err?.response?.data?.error || "Errore anteprima import.");
                                                    } finally {
                                                        setWooImportPreviewLoading(false);
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 font-black text-xs uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
                                            >
                                                {wooImportPreviewLoading ? "Carico…" : "Genera anteprima"}
                                            </button>
                                        </div>

                                        {wooImportPreview?.items ? (
                                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                                <table className="min-w-full text-left text-[12px]">
                                                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        <tr>
                                                            <th className="px-3 py-2">SKU</th>
                                                            <th className="px-3 py-2">Nome</th>
                                                            <th className="px-3 py-2">Prezzo</th>
                                                            <th className="px-3 py-2">Brand</th>
                                                            <th className="px-3 py-2">Stato</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                                                        {(wooImportPreview.items as any[]).slice(0, 12).map((it, idx) => {
                                                            const hasErr = Array.isArray(it.errors) && it.errors.length > 0;
                                                            const hasWarn = Array.isArray(it.warnings) && it.warnings.length > 0;
                                                            return (
                                                                <tr key={idx} className="hover:bg-slate-50/70">
                                                                    <td className="px-3 py-2">{it.sku || "—"}</td>
                                                                    <td className="px-3 py-2 max-w-[240px] truncate">{it.name || "—"}</td>
                                                                    <td className="px-3 py-2">{it.price != null ? it.price : "—"}</td>
                                                                    <td className="px-3 py-2">{it.brand || "—"}</td>
                                                                    <td className="px-3 py-2">
                                                                        {hasErr ? (
                                                                            <span className="text-red-700 font-black">Errore</span>
                                                                        ) : hasWarn ? (
                                                                            <span className="text-amber-700 font-black">Avviso</span>
                                                                        ) : (
                                                                            <span className="text-emerald-700 font-black">OK</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-500">
                                                Genera l’anteprima per vedere SKU, prezzo, brand e possibili errori prima di importare.
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            type="button"
                                            disabled={isImportingWoo}
                                            onClick={async () => {
                                                setIsImportingWoo(true);
                                                setWooImportReport(null);
                                                const toastId = toast.loading("Import WooCommerce in corso...");
                                                try {
                                                    const payload = {
                                                        ...wooConfig,
                                                        limit: wooImportLimit,
                                                        mapping: {
                                                            ...wooImportMappingDraft,
                                                        },
                                                        overwrite: wooImportOverwrite,
                                                        importWithErrors: wooImportWithErrors,
                                                        generateSkuForMissingChannelSku: wooImportGenerateSkuForMissingWoo,
                                                        generateSkuForMissingWooSku: wooImportGenerateSkuForMissingWoo,
                                                    };
                                                    const res = await axios.post(
                                                        "/api/integrations/woocommerce/import",
                                                        payload,
                                                        { ...companyReq, timeout: 180000 }
                                                    );
                                                    setWooImportReport(res.data?.report || null);
                                                    toast.update(toastId, {
                                                        render:
                                                            `Import completato: ${res.data.created || 0} creati, ${res.data.updated || 0} aggiornati, ` +
                                                            `${res.data.skipped || 0} saltati, ${res.data.errors || 0} errori.`,
                                                        type: "success",
                                                        isLoading: false,
                                                        autoClose: 5000,
                                                    });
                                                    fetchProducts();
                                                } catch (err: any) {
                                                    toast.update(toastId, {
                                                        render: err?.response?.data?.error || "Errore durante l'importazione da WooCommerce",
                                                        type: "error",
                                                        isLoading: false,
                                                        autoClose: 6000,
                                                    });
                                                } finally {
                                                    setIsImportingWoo(false);
                                                }
                                            }}
                                            className="flex-1 py-3 px-4 rounded-xl bg-emerald-800 text-white font-black uppercase text-xs tracking-widest hover:bg-emerald-900 disabled:opacity-50"
                                        >
                                            {isImportingWoo ? "Importo…" : "Importa ora"}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!wooImportReport?.rows?.length}
                                            onClick={() => {
                                                const rows: any[] = wooImportReport?.rows || [];
                                                const header = ["at", "sku", "wooId", "action", "message"];
                                                const escCsv = (v: unknown) =>
                                                    `"${String(v ?? "").replace(/"/g, '""')}"`;
                                                const csv = [
                                                    header.join(","),
                                                    ...rows.map((r) =>
                                                        [
                                                            wooImportReport?.at || "",
                                                            r.sku || "",
                                                            r.wooId ?? "",
                                                            r.action || "",
                                                            r.message || "",
                                                        ].map(escCsv).join(",")
                                                    ),
                                                ].join("\n");
                                                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement("a");
                                                a.href = url;
                                                a.download = `woo-import-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-black uppercase text-xs tracking-widest hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Scarica report CSV
                                        </button>
                                    </div>

                                    {wooImportReport?.rows?.length ? (
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                                Report import (prime righe)
                                            </p>
                                            <ul className="space-y-1 text-[12px] font-semibold text-slate-700">
                                                {wooImportReport.rows.slice(0, 12).map((r: any, i: number) => (
                                                    <li key={i}>
                                                        <span className="font-black">{r.action}</span> —{" "}
                                                        <code className="text-slate-900">{r.sku || "NO-SKU"}</code>{" "}
                                                        {r.message ? <span className="text-slate-500">· {r.message}</span> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showBulkTranslateModal && (
                    <div className="fixed inset-0 z-[116] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowBulkTranslateModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.96, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto border border-gray-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-5 pb-3 bg-white border-b border-gray-100">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2.5 bg-indigo-600 rounded-xl shrink-0">
                                        <Languages className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-black text-gray-900 leading-tight">
                                            Traduzioni massive
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {selectedIds.length} prodotti selezionati · testo sorgente dalla lingua base
                                            della scheda (come &quot;Traduci / Correggi AI&quot; in modale)
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkTranslateModal(false)}
                                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                                    aria-label="Chiudi"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                        Lingua di destinazione
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200">
                                        {(["it", "en", "fr", "de", "es"] as const).map((lang) => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => setBulkTranslateTargetLang(lang)}
                                                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    bulkTranslateTargetLang === lang
                                                        ? "bg-slate-900 text-white shadow"
                                                        : "text-slate-500 hover:text-slate-800"
                                                }`}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                        Campi da tradurre
                                    </span>
                                    <div className="space-y-2">
                                        {(
                                            [
                                                {
                                                    key: "title" as const,
                                                    label: "Titolo",
                                                    hint: "Il modello non traduce il brand né i nomi propri del prodotto se già presenti nel titolo.",
                                                },
                                                {
                                                    key: "seoAiText" as const,
                                                    label: "Copy breve / SEO (seoAiText)",
                                                },
                                                {
                                                    key: "description" as const,
                                                    label: "Descrizione lunga",
                                                },
                                                {
                                                    key: "bulletPoints" as const,
                                                    label: "Bullet / caratteristiche",
                                                },
                                            ] satisfies ReadonlyArray<{
                                                key: "title" | "seoAiText" | "description" | "bulletPoints";
                                                label: string;
                                                hint?: string;
                                            }>
                                        ).map(({ key, label, hint }) => (
                                            <label
                                                key={key}
                                                className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 hover:bg-slate-50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={bulkTranslateFields[key]}
                                                    onChange={(e) =>
                                                        setBulkTranslateFields((prev) => ({
                                                            ...prev,
                                                            [key]: e.target.checked,
                                                        }))
                                                    }
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-bold text-slate-800">{label}</span>
                                                    {hint ? (
                                                        <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                                                            {hint}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-500 leading-relaxed border border-amber-100 bg-amber-50/80 rounded-xl px-3 py-2">
                                    I prodotti senza testo nei campi selezionati vengono saltati. Ogni prodotto viene
                                    aggiornato nella lingua scelta; le altre lingue non vengono modificate.
                                </p>

                                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkTranslateModal(false)}
                                        className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
                                    >
                                        Annulla
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleBulkMassTranslate()}
                                        disabled={isBulkMassTranslating}
                                        className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {isBulkMassTranslating ? "Avvio…" : "Avvia traduzione"}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
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
                                        Tutti i campi prodotto (SKU, FK categoria/brand/IVA, testi IT, prezzo, valuta, extra).
                                        Valore vuoto dove consentito azzera il campo o rimuove un extra. Con &quot;Solo se
                                        vuoto&quot; non sovrascrivi dati già presenti. Nel valore testuale puoi usare
                                        segnaposti <span className="font-mono">{"{{campo}}"}</span> (es.{" "}
                                        <span className="font-mono">{"{{title}} · {{sku}}"}</span>): vengono sostituiti per
                                        ogni prodotto lato server.
                                    </p>
                                    <div className="space-y-3">
                                        <label className="block">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Campo</span>
                                            <select
                                                value={bulkOpFieldPath}
                                                onChange={(e) => {
                                                    setBulkOpFieldPath(e.target.value);
                                                    setBulkOpValue("");
                                                }}
                                                className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                                            >
                                                {BULK_SET_FIELD_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {bulkOpFieldPath === "vatCodeId" && vatCodes.length === 0 && (
                                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                                Nessun codice IVA in anagrafica: creane almeno uno in{" "}
                                                <strong>Impostazioni</strong> (sezione IVA) prima di applicare in massa.
                                            </p>
                                        )}
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
                                        <div className="block">
                                            <span className="text-[10px] font-black uppercase text-slate-400">
                                                Valore
                                            </span>
                                            {!bulkValueUsesEntitySelect && (
                                                <div className="mt-1 flex flex-col sm:flex-row flex-wrap gap-2 sm:items-end">
                                                    <label className="block min-w-[120px] flex-1">
                                                        <span className="text-[10px] font-black uppercase text-slate-400">
                                                            Separatore tra campi
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={bulkTemplateSep}
                                                            onChange={(e) => setBulkTemplateSep(e.target.value)}
                                                            className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-mono text-slate-800"
                                                            placeholder=" · "
                                                            aria-label="Separatore tra segnaposti"
                                                        />
                                                    </label>
                                                    <label className="block min-w-[200px] flex-[2]">
                                                        <span className="text-[10px] font-black uppercase text-slate-400">
                                                            Inserisci campo scheda
                                                        </span>
                                                        <select
                                                            className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                                                            value=""
                                                            onChange={(e) => {
                                                                const token = e.target.value;
                                                                e.target.value = "";
                                                                if (!token) return;
                                                                const piece = `{{${token}}}`;
                                                                setBulkOpValue((prev) => {
                                                                    const trimmed = prev.trim();
                                                                    if (!trimmed) return piece;
                                                                    return prev + bulkTemplateSep + piece;
                                                                });
                                                            }}
                                                            aria-label="Aggiungi segnaposto campo scheda"
                                                        >
                                                            <option value="">— Aggiungi {"{{campo}}"}…</option>
                                                            {BULK_TEMPLATE_FIELD_KEYS.map((o) => (
                                                                <option key={o.token} value={o.token}>
                                                                    {o.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                            )}
                                            {bulkValueUsesEntitySelect ? (
                                                <div className="mt-1 space-y-1">
                                                    <SearchableSelect
                                                        options={bulkSelectOptionsForField}
                                                        value={
                                                            bulkOpValue === ""
                                                                ? null
                                                                : bulkOpValue
                                                        }
                                                        onChange={(v) =>
                                                            setBulkOpValue(v == null ? "" : String(v))
                                                        }
                                                        placeholder="Cerca o scegli dalla lista…"
                                                        searchPlaceholder="Filtra…"
                                                        className="w-full"
                                                        dropdownMinWidth={320}
                                                    />
                                                    <p className="text-[10px] text-slate-500 leading-snug">
                                                        {bulkOpFieldPath === "vatCodeId"
                                                            ? "Codici IVA definiti in Impostazioni (stessa azienda). Utile per il push Presta con listino IVA inclusa. Per azzerare il codice sul prodotto scegli «Nessuna selezione»."
                                                            : "Elenco da brand e categorie dell'azienda attiva. Per azzerare il campo scegli «Nessuna selezione» nel menu."}
                                                    </p>
                                                </div>
                                            ) : bulkSelectFieldKind != null && effectiveCompanyId == null ? (
                                                <div className="mt-1 space-y-2">
                                                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                                        Seleziona un&apos;azienda dal menu per usare l&apos;elenco
                                                        brand/categorie; oppure incolla un valore manuale qui sotto.
                                                    </p>
                                                    <textarea
                                                        value={bulkOpValue}
                                                        onChange={(e) => setBulkOpValue(e.target.value)}
                                                        rows={2}
                                                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800"
                                                        placeholder={bulkSetFieldValuePlaceholder(
                                                            bulkOpFieldPath,
                                                            bulkOpExtraKey
                                                        )}
                                                    />
                                                </div>
                                            ) : (
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
                                            )}
                                        </div>
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkWorking}
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
                                            disabled={isBulkTranslatingTitle || isBulkMassTranslating || isBulkWorking}
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
                                            disabled={isExportingSelectedFile}
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
                                            disabled={isExportingSelectedFile}
                                            className="px-3 py-2 rounded-xl bg-white text-slate-900 text-[11px] font-black uppercase border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            Esporta CSV
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowBulkOperationsModal(false);
                                                setTimeout(() => void handleBulkStripHtmlDescriptions(), 0);
                                            }}
                                            disabled={isBulkWorking}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 text-teal-900 text-[11px] font-black uppercase border border-teal-100 hover:bg-teal-100 disabled:opacity-50"
                                        >
                                            <Eraser className="w-4 h-4" />
                                            Rimuovi HTML descrizioni
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
                                        disabled={isBulkDeleting}
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
                            <div className="mb-5">
                                <label className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={bulkSeoFastMode}
                                        onChange={(e) => setBulkSeoFastMode(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
                                    />
                                    Modalita Fast (piu veloce)
                                </label>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scelta modalità</span>
                                    <InfoHint text={INFO_HINTS.erp.bulkSeoMode} />
                                </div>
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

            {/* Push canale: campi da sovrascrivere (aggiornamento: deselezionato = mantieni sul negozio) */}
            <AnimatePresence>
                {pushFieldModal && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setPushFieldModal(null)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[min(90vh,820px)] flex flex-col border border-gray-100"
                        >
                            <div className="flex items-start gap-3 mb-4 shrink-0">
                                <div
                                    className={`p-3 rounded-xl ${pushFieldModal.channel === "presta" ? "bg-violet-100" : "bg-emerald-100"}`}
                                >
                                    <ShoppingCart
                                        className={`w-6 h-6 ${pushFieldModal.channel === "presta" ? "text-violet-700" : "text-emerald-700"}`}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-black text-gray-900">
                                        {pushFieldModal.channel === "presta"
                                            ? "Push PrestaShop"
                                            : "Push WooCommerce"}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {pushFieldModal.mode === "bulk"
                                            ? `${selectedIds.length} prodotti selezionati`
                                            : "Un prodotto"}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 mb-3 leading-snug shrink-0">
                                Spunta i campi che vuoi <span className="font-bold">sovrascrivere</span> con i dati
                                dell&apos;ERP. Se togli la spunta, in caso di prodotto già presente sul negozio resta il
                                valore attuale online. Per i <span className="font-bold">nuovi</span> prodotti vengono
                                comunque inviati i dati necessari dalla scheda.
                            </p>
                            <div className="flex flex-wrap gap-2 mb-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() =>
                                        pushFieldModal.channel === "presta"
                                            ? setPrestaPushOverwrite({ ...DEFAULT_PRESTA_PUSH_OVERWRITE })
                                            : setWooPushOverwrite({ ...DEFAULT_WOO_PUSH_OVERWRITE })
                                    }
                                    className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                                >
                                    Tutti
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        pushFieldModal.channel === "presta"
                                            ? setPrestaPushOverwrite(allFalsePrestaPushOverwrite())
                                            : setWooPushOverwrite(allFalseWooPushOverwrite())
                                    }
                                    className="text-[10px] font-black uppercase tracking-widest text-slate-600 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                                >
                                    Nessuno
                                </button>
                            </div>
                            <div className="overflow-y-auto flex-1 min-h-0 pr-1 space-y-2 border-t border-slate-100 pt-3">
                                {pushFieldModal.channel === "presta" ? (
                                    <>
                                        {PRESTA_PUSH_OVERWRITE_ROWS.map(({ key, label }) => (
                                            <label
                                                key={key}
                                                className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 cursor-pointer hover:border-violet-200"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={prestaPushOverwrite[key]}
                                                    onChange={(e) =>
                                                        setPrestaPushOverwrite((prev) => ({
                                                            ...prev,
                                                            [key]: e.target.checked,
                                                        }))
                                                    }
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 shrink-0"
                                                />
                                                <span className="text-sm font-bold text-slate-800">{label}</span>
                                            </label>
                                        ))}
                                        <div className="pt-4 mt-1 border-t border-violet-100 space-y-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">
                                                Parametri pubblicazione (questa esecuzione)
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="text-[10px] font-bold text-slate-500 col-span-1 flex flex-col gap-0.5">
                                                    Lingua contenuti
                                                    <select
                                                        value={prestaPublishSession.languageId}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                languageId: e.target.value,
                                                            }))
                                                        }
                                                        disabled={
                                                            psPrestaMetaLoading && psLanguagesList.length === 0
                                                        }
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                                                    >
                                                        {psPrestaMetaLoading && psLanguagesList.length === 0 ? (
                                                            <option value={prestaPublishSession.languageId}>
                                                                Caricamento lingue…
                                                            </option>
                                                        ) : null}
                                                        {!psLanguagesList.some(
                                                            (l) => String(l.id) === prestaPublishSession.languageId
                                                        ) &&
                                                        prestaPublishSession.languageId.trim() ? (
                                                            <option value={prestaPublishSession.languageId}>
                                                                ID {prestaPublishSession.languageId} (non in elenco)
                                                            </option>
                                                        ) : null}
                                                        {psLanguagesList.map((l) => (
                                                            <option key={String(l.id)} value={String(l.id)}>
                                                                {l.name}
                                                                {l.iso_code != null && String(l.iso_code).trim()
                                                                    ? ` (${l.iso_code})`
                                                                    : ""}{" "}
                                                                · id {l.id}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-500 col-span-1 flex flex-col gap-0.5">
                                                    Categoria default
                                                    <select
                                                        value={prestaPublishSession.defaultCategoryId}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                defaultCategoryId: e.target.value,
                                                            }))
                                                        }
                                                        disabled={
                                                            psPrestaMetaLoading && psCategoriesList.length === 0
                                                        }
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                                                    >
                                                        {psPrestaMetaLoading && psCategoriesList.length === 0 ? (
                                                            <option value={prestaPublishSession.defaultCategoryId}>
                                                                Caricamento categorie…
                                                            </option>
                                                        ) : null}
                                                        {!psCategoriesList.some(
                                                            (c) => String(c.id) === prestaPublishSession.defaultCategoryId
                                                        ) &&
                                                        prestaPublishSession.defaultCategoryId.trim() ? (
                                                            <option value={prestaPublishSession.defaultCategoryId}>
                                                                ID {prestaPublishSession.defaultCategoryId} (non in
                                                                elenco)
                                                            </option>
                                                        ) : null}
                                                        {psCategoriesList.map((c) => (
                                                            <option key={c.id} value={String(c.id)}>
                                                                {c.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-500 col-span-1 flex flex-col gap-0.5">
                                                    Gruppo tasse
                                                    <select
                                                        value={prestaPublishSession.taxRulesGroupId}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                taxRulesGroupId: e.target.value,
                                                            }))
                                                        }
                                                        disabled={
                                                            psPrestaMetaLoading &&
                                                            psTaxRulesGroupsList.length === 0
                                                        }
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                                                    >
                                                        {psPrestaMetaLoading &&
                                                        psTaxRulesGroupsList.length === 0 ? (
                                                            <option value={prestaPublishSession.taxRulesGroupId}>
                                                                Caricamento gruppi…
                                                            </option>
                                                        ) : null}
                                                        {!psTaxRulesGroupsList.some(
                                                            (t) =>
                                                                String(t.id) ===
                                                                prestaPublishSession.taxRulesGroupId
                                                        ) &&
                                                        prestaPublishSession.taxRulesGroupId.trim() ? (
                                                            <option value={prestaPublishSession.taxRulesGroupId}>
                                                                ID {prestaPublishSession.taxRulesGroupId} (non in
                                                                elenco)
                                                            </option>
                                                        ) : null}
                                                        {psTaxRulesGroupsList.map((t) => (
                                                            <option key={t.id} value={String(t.id)}>
                                                                {t.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-500 col-span-1 flex flex-col gap-0.5">
                                                    Max immagini
                                                    <select
                                                        value={(() => {
                                                            const raw = prestaPublishSession.maxImages.trim();
                                                            if (raw === "") return "12";
                                                            if (PRESTA_MAX_IMAGE_SELECT_OPTIONS.includes(raw))
                                                                return raw;
                                                            return raw;
                                                        })()}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                maxImages: e.target.value,
                                                            }))
                                                        }
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                                                    >
                                                        {(() => {
                                                            const raw = prestaPublishSession.maxImages.trim();
                                                            if (
                                                                raw !== "" &&
                                                                !PRESTA_MAX_IMAGE_SELECT_OPTIONS.includes(raw)
                                                            ) {
                                                                return (
                                                                    <option value={raw}>
                                                                        {raw} (valore attuale)
                                                                    </option>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                        {PRESTA_MAX_IMAGE_SELECT_OPTIONS.map((n) => (
                                                            <option key={n} value={n}>
                                                                {n}
                                                                {n === "12" ? " (tipico)" : ""}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-500 col-span-2 flex flex-col gap-0.5">
                                                    Negozio (multistore)
                                                    <select
                                                        value={prestaPublishSession.idShop}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                idShop: e.target.value.replace(/\D/g, ""),
                                                            }))
                                                        }
                                                        disabled={psPrestaMetaLoading && psShopsList.length === 0}
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                                                    >
                                                        <option value="">Tutti i negozi / default webservice</option>
                                                        {psShopsList.map((s) => (
                                                            <option key={s.id} value={String(s.id)}>
                                                                {s.name} · id {s.id}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="text-[10px] font-bold text-slate-500 col-span-2 flex flex-col gap-0.5">
                                                    Parent nuove categorie
                                                    <select
                                                        value={prestaPublishSession.categoryParentId}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                categoryParentId: e.target.value,
                                                            }))
                                                        }
                                                        disabled={
                                                            psPrestaMetaLoading && psCategoriesList.length === 0
                                                        }
                                                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:opacity-60"
                                                    >
                                                        <option value="">
                                                            Predefinito (root / Home del negozio, tipicamente id 2)
                                                        </option>
                                                        {!psCategoriesList.some(
                                                            (c) =>
                                                                String(c.id) === prestaPublishSession.categoryParentId
                                                        ) &&
                                                        prestaPublishSession.categoryParentId.trim() ? (
                                                            <option value={prestaPublishSession.categoryParentId}>
                                                                ID {prestaPublishSession.categoryParentId} (non in
                                                                elenco)
                                                            </option>
                                                        ) : null}
                                                        {psCategoriesList.map((c) => (
                                                            <option key={`p-${c.id}`} value={String(c.id)}>
                                                                {c.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                            <label className="text-[10px] font-bold text-slate-500 flex flex-col gap-0.5">
                                                Unità del peso in anagrafica (opzionale)
                                                <select
                                                    value={prestaPublishSession.erpWeightInputUnit}
                                                    onChange={(e) =>
                                                        setPrestaPublishSession((s) => ({
                                                            ...s,
                                                            erpWeightInputUnit: e.target.value as PrestaPublishSession["erpWeightInputUnit"],
                                                        }))
                                                    }
                                                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                                                >
                                                    <option value="">
                                                        Nessuna — default conversione come chilogrammi (kg)
                                                    </option>
                                                    <option value="kg">Chilogrammi (kg)</option>
                                                    <option value="g">Grammi (g)</option>
                                                    <option value="lb">Libbre (lb)</option>
                                                </select>
                                                <span className="text-[9px] font-medium text-slate-400 leading-snug">
                                                    Imposta solo se il peso in scheda non è espresso nell’unità di
                                                    default.
                                                </span>
                                            </label>
                                            <div className="flex flex-col gap-2 text-xs font-semibold text-slate-700">
                                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={prestaPublishSession.erpPriceIncludesVat}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                erpPriceIncludesVat: e.target.checked,
                                                            }))
                                                        }
                                                        className="rounded border-slate-300 text-violet-600"
                                                    />
                                                    Listino IVA inclusa → campo price senza IVA
                                                </label>
                                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={prestaPublishSession.uploadImages}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                uploadImages: e.target.checked,
                                                            }))
                                                        }
                                                        className="rounded border-slate-300 text-violet-600"
                                                    />
                                                    Carica immagini da Iris
                                                </label>
                                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={prestaPublishSession.syncManufacturer}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                syncManufacturer: e.target.checked,
                                                            }))
                                                        }
                                                        className="rounded border-slate-300 text-violet-600"
                                                    />
                                                    Crea / aggancia produttore da marca
                                                </label>
                                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={prestaPublishSession.syncCategoryFromProduct}
                                                        onChange={(e) =>
                                                            setPrestaPublishSession((s) => ({
                                                                ...s,
                                                                syncCategoryFromProduct: e.target.checked,
                                                            }))
                                                        }
                                                        className="rounded border-slate-300 text-violet-600"
                                                    />
                                                    Risolvi categoria da prodotto
                                                </label>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    WOO_PUSH_OVERWRITE_ROWS.map(({ key, label }) => (
                                        <label
                                            key={key}
                                            className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 cursor-pointer hover:border-emerald-200"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={wooPushOverwrite[key]}
                                                onChange={(e) =>
                                                    setWooPushOverwrite((prev) => ({
                                                        ...prev,
                                                        [key]: e.target.checked,
                                                    }))
                                                }
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-700 shrink-0"
                                            />
                                            <span className="text-sm font-bold text-slate-800">{label}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-100 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => void confirmPushFieldModal()}
                                    className={`w-full py-3 px-4 text-white font-bold rounded-xl transition-all text-sm ${
                                        pushFieldModal.channel === "presta"
                                            ? "bg-violet-900 hover:bg-violet-950"
                                            : "bg-emerald-800 hover:bg-emerald-900"
                                    }`}
                                >
                                    Conferma e pubblica
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPushFieldModal(null)}
                                    className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                >
                                    Annulla
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Import da PrestaShop: limite, overwrite e SKU provvisori */}
            <AnimatePresence>
                {showPrestaImportModal && (
                    <div className="fixed inset-0 z-[116] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => !isImportingPs && setShowPrestaImportModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[min(90vh,720px)] overflow-y-auto border border-violet-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-black text-gray-900 mb-1">Import da PrestaShop</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Brand selezionato richiesto. Scegli quanti prodotti caricare e quali blocchi aggiornare
                                su Iris.
                            </p>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                                Numero massimo di prodotti
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={prestaImportDraft.limit}
                                onChange={(e) =>
                                    setPrestaImportDraft((d) => ({
                                        ...d,
                                        limit: e.target.value.replace(/\D/g, ""),
                                    }))
                                }
                                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono mb-4"
                            />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                Cosa aggiornare se lo SKU esiste già in Iris
                            </p>
                            <div className="space-y-2 mb-4">
                                {(
                                    [
                                        ["overwriteBase", "Anagrafica (categoria, brand, EAN, IVA)"],
                                        ["overwriteTexts", "Testi multilingua"],
                                        ["overwritePrice", "Prezzo listino default"],
                                        ["overwriteExtras", "Extra (peso, dimensioni, stock, …)"],
                                        ["overwriteImages", "Immagine principale se presente su Presta"],
                                    ] as const
                                ).map(([k, label]) => (
                                    <label
                                        key={k}
                                        className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={prestaImportDraft[k]}
                                            onChange={(e) =>
                                                setPrestaImportDraft((d) => ({
                                                    ...d,
                                                    [k]: e.target.checked,
                                                }))
                                            }
                                            className="rounded border-slate-300 text-violet-600"
                                        />
                                        <span className="text-sm font-bold text-slate-800">{label}</span>
                                    </label>
                                ))}
                            </div>
                            <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 mb-4">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={prestaImportGenerateSkuForMissing}
                                    onChange={(e) => setPrestaImportGenerateSkuForMissing(e.target.checked)}
                                />
                                <span>
                                    Senza <span className="font-mono">reference</span> su Presta: genera SKU{" "}
                                    <span className="font-mono">AUTO-PS-id</span> (modificabile dopo in Iris).
                                </span>
                            </label>
                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    disabled={isImportingPs}
                                    onClick={() =>
                                        void runPrestaImportJob(prestaImportDraft, prestaImportGenerateSkuForMissing)
                                    }
                                    className="w-full py-3 px-4 bg-violet-900 text-white font-bold rounded-xl hover:bg-violet-950 disabled:opacity-50 text-sm"
                                >
                                    Avvia import
                                </button>
                                <button
                                    type="button"
                                    disabled={isImportingPs}
                                    onClick={() => setShowPrestaImportModal(false)}
                                    className="w-full py-2.5 text-gray-500 font-medium text-sm"
                                >
                                    Annulla
                                </button>
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
                                                        <HoverTooltip text="Sposta in alto">
                                                            <button
                                                                type="button"
                                                                disabled={idx === 0}
                                                                onClick={() => moveBulkTitleField(idx, -1)}
                                                                className="p-1 rounded-lg hover:bg-white disabled:opacity-30"
                                                            >
                                                                <ArrowUp className="w-3.5 h-3.5" />
                                                            </button>
                                                        </HoverTooltip>
                                                        <HoverTooltip text="Sposta in basso">
                                                            <button
                                                                type="button"
                                                                disabled={idx === bulkTitleFieldsSelected.length - 1}
                                                                onClick={() => moveBulkTitleField(idx, 1)}
                                                                className="p-1 rounded-lg hover:bg-white disabled:opacity-30"
                                                            >
                                                                <ArrowDown className="w-3.5 h-3.5" />
                                                            </button>
                                                        </HoverTooltip>
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
                            src={productImageDisplaySrc(zoomImageUrl)}
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
                                                                        openProductEditor(p);
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

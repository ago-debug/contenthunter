/**
 * Segnaposto `{{campo}}` nel valore delle modifiche massive: risolti per ogni prodotto lato API.
 * Chiavi case-insensitive; `extra:chiave` per i campi extra dinamici.
 */

export type BulkProductSnapshot = {
    id: number;
    companyId: number;
    sku: string;
    ean: string | null;
    parentSku: string | null;
    brand: string | null;
    category: string | null;
    brandId: number | null;
    categoryId: number | null;
    subCategoryId: number | null;
    subSubCategoryId: number | null;
    vatCodeId: number | null;
    texts: Array<{
        title: string | null;
        description: string | null;
        docDescription: string | null;
        bulletPoints: string | null;
        seoAiText: string | null;
    }>;
    extraFields: Array<{ key: string; value: string }>;
    prices: Array<{ price: unknown; currency: string | null }>;
};

function extraValue(p: BulkProductSnapshot, logicalKey: string): string {
    const want = logicalKey.trim().toLowerCase();
    const ex = p.extraFields.find((e) => e.key.trim().toLowerCase() === want);
    return ex?.value ?? "";
}

function priceToString(price: unknown): string {
    if (price == null) return "";
    if (typeof price === "number" || typeof price === "string") return String(price);
    if (typeof price === "bigint") return price.toString();
    if (typeof price === "object" && price !== null && "toString" in price) {
        try {
            return String((price as { toString: () => string }).toString());
        } catch {
            return "";
        }
    }
    return String(price);
}

function lookup(p: BulkProductSnapshot, key: string): string {
    const k = key.trim().toLowerCase();
    const it = p.texts?.[0];

    if (k.startsWith("extra:")) {
        return extraValue(p, k.slice(6));
    }

    switch (k) {
        case "sku":
            return p.sku ?? "";
        case "ean":
            return p.ean ?? "";
        case "parentsku":
            return p.parentSku ?? "";
        case "brand":
            return p.brand ?? "";
        case "category":
            return p.category ?? "";
        case "brandid":
            return p.brandId != null ? String(p.brandId) : "";
        case "categoryid":
            return p.categoryId != null ? String(p.categoryId) : "";
        case "subcategoryid":
            return p.subCategoryId != null ? String(p.subCategoryId) : "";
        case "subsubcategoryid":
            return p.subSubCategoryId != null ? String(p.subSubCategoryId) : "";
        case "vatcodeid":
            return p.vatCodeId != null ? String(p.vatCodeId) : "";
        case "title":
            return it?.title ?? "";
        case "description":
            return it?.description ?? "";
        case "docdescription":
            return it?.docDescription ?? "";
        case "bulletpoints":
            return it?.bulletPoints ?? "";
        case "seoaitext":
            return it?.seoAiText ?? "";
        case "price":
            return priceToString(p.prices?.[0]?.price);
        case "currency":
            return (p.prices?.[0]?.currency ?? "").trim();
        case "dimensions":
            return extraValue(p, "dimensions");
        case "weight":
            return extraValue(p, "weight");
        case "material":
            return extraValue(p, "material");
        default:
            return "";
    }
}

export function resolveBulkFieldTemplate(template: string, p: BulkProductSnapshot): string {
    if (!template.includes("{{")) return template;
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
        const inner = String(rawKey).trim();
        return lookup(p, inner);
    });
}

export type CanonicalStockExtraKey = "stockLocal" | "stockSupplier";

const STOCK_LOCAL_ALIASES = [
    "stocklocal",
    "giacenzalocale",
    "giacenza_locale",
    "qta_locale",
    "qtalocale",
] as const;

const STOCK_SUPPLIER_ALIASES = [
    "stocksupplier",
    "giacenzafornitore",
    "giacenza_fornitore",
    "qta_fornitore",
    "qtafornitore",
] as const;

export const STOCK_EXTRA_ALIAS_MAP: Record<CanonicalStockExtraKey, readonly string[]> = {
    stockLocal: STOCK_LOCAL_ALIASES,
    stockSupplier: STOCK_SUPPLIER_ALIASES,
};

export function normalizeStockExtraKey(rawKey: string): CanonicalStockExtraKey | "" {
    const k = String(rawKey || "").toLowerCase().replace(/[\s_-]/g, "");
    if (STOCK_LOCAL_ALIASES.includes(k as (typeof STOCK_LOCAL_ALIASES)[number])) return "stockLocal";
    if (STOCK_SUPPLIER_ALIASES.includes(k as (typeof STOCK_SUPPLIER_ALIASES)[number])) return "stockSupplier";
    return "";
}

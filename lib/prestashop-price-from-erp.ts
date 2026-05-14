/**
 * Legge il prezzo listino dal payload prodotto ERP (scheda / API / import).
 * Supporta `price` in cima, `listPrice`, array `prices` (listino default) o oggetto `prices.default`.
 */
function isNonEmptyScalar(v: unknown): boolean {
    return v !== undefined && v !== null && String(v).trim() !== "";
}

function priceListRowName(row: unknown): string {
    if (!row || typeof row !== "object") return "";
    const o = row as Record<string, unknown>;
    return String(o.listName ?? o.list_name ?? "").trim().toLowerCase();
}

export function resolveErpListPriceRaw(product: unknown): unknown {
    if (product == null || typeof product !== "object") return undefined;
    const p = product as Record<string, unknown>;
    if (isNonEmptyScalar(p.price)) return p.price;
    if (isNonEmptyScalar(p.listPrice)) return p.listPrice;
    const prices = p.prices;
    if (Array.isArray(prices) && prices.length > 0) {
        const def = prices.find((row) => priceListRowName(row) === "default");
        const row = def ?? prices[0];
        if (row && typeof row === "object") {
            const pr = (row as Record<string, unknown>).price;
            if (isNonEmptyScalar(pr)) return pr;
        }
    }
    if (prices && typeof prices === "object" && !Array.isArray(prices)) {
        const d = (prices as Record<string, unknown>).default;
        if (isNonEmptyScalar(d)) return d;
    }
    return undefined;
}

/** Parsa il prezzo listino dall’ERP (stringa o numero). */
export function parseErpPriceToNumber(raw: unknown): number {
    if (raw === null || raw === undefined) return NaN;
    const n = parseFloat(String(raw).replace(",", ".").replace(/[^\d.-]/g, ""));
    return n;
}

/**
 * PrestaShop nel webservice scrive sempre `<price>` come **imponibile** (IVA esclusa).
 * La colonna «IVA inclusa» / IVATO in back office è calcolata da Presta con `id_tax_rules_group`.
 * Con listino ERP **IVA inclusa** occorre quindi scorporare: netto = lordo / (1 + aliquota/100),
 * usando l’aliquota del codice IVA ERP o, in fallback, quella del gruppo tasse inviato al push.
 */
export function erpGrossInclVatToPrestaNet(gross: number, vatRatePercent: number): number {
    if (!Number.isFinite(gross)) return 0;
    if (!Number.isFinite(vatRatePercent) || vatRatePercent < 0) return gross;
    const denom = 1 + vatRatePercent / 100;
    if (denom === 0 || !Number.isFinite(denom)) return gross;
    const net = gross / denom;
    return Number.isFinite(net) ? net : gross;
}

/**
 * Inverso di {@link erpGrossInclVatToPrestaNet}: in import da PrestaShop il campo `price`
 * è imponibile; il listino ERP default è **IVA inclusa** (allineato a push e colonna «Prezzo ivato»).
 */
export function prestashopNetToErpGrossInclVat(net: number, ratePercent: number | null | undefined): number {
    if (!Number.isFinite(net)) return net;
    if (ratePercent == null || !Number.isFinite(ratePercent) || ratePercent < 0) return net;
    const gross = net * (1 + ratePercent / 100);
    return Number.isFinite(gross) ? gross : net;
}

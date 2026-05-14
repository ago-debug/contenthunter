import { NextResponse } from "next/server";
import axios from "axios";
import { requireCompanyId } from "@/lib/auth-api";
import {
    integrationImportNumericId,
    placeholderSkuWooCommerce,
    readGenerateSkuForMissingChannelSku,
} from "@/lib/integration-import-placeholder-sku";

function parsePrice(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().replace(/[^0-9.,-]/g, "").replace(",", ".");
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

function getWooAttr(attributes: any[], name: string): string | null {
    if (!Array.isArray(attributes)) return null;
    const target = name.trim().toLowerCase();
    const found = attributes.find((a) => (a?.name || "").toString().trim().toLowerCase() === target);
    const opt0 = Array.isArray(found?.options) ? found.options[0] : null;
    const val = (opt0 ?? "").toString().trim();
    return val ? val : null;
}

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Preview import WooCommerce: scarica prodotti da Woo e mostra una preview con errori/avvisi, senza scrivere su DB.
 */
export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { domain, key, secret, limit = 20, mapping } = body as {
            domain: string;
            key: string;
            secret: string;
            limit?: number;
            generateSkuForMissingWooSku?: boolean;
            generateSkuForMissingChannelSku?: boolean;
            mapping?: {
                brandAttributeName?: string;
                materialAttributeName?: string;
                dimensionsAttributeName?: string;
                extrasToERPExtraFields?: boolean;
                stockQuantityERPKey?: "stockLocal" | "stockSupplier";
                acfMetaPrefix?: string;
                acfToERPExtraFields?: boolean;
            };
        };

        if (!domain || !key || !secret) {
            return NextResponse.json({ error: "Data missing" }, { status: 400 });
        }

        const generateSkuForMissing = readGenerateSkuForMissingChannelSku(
            body as Record<string, unknown>,
            "woocommerce"
        );

        const effectiveLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 20;
        const perPage = 25;

        const effectiveBrandAttr = (mapping?.brandAttributeName ?? "Brand").toString();
        const effectiveMaterialAttr = (mapping?.materialAttributeName ?? "Material").toString();
        const effectiveDimensionsAttr = (mapping?.dimensionsAttributeName ?? "Dimensions").toString();
        const stockKey = mapping?.stockQuantityERPKey ?? "stockLocal";
        const acfPrefix = (mapping?.acfMetaPrefix ?? "acf_").toString().trim();
        const acfToERPExtraFields = mapping?.acfToERPExtraFields ?? true;

        const items: Array<{
            wooId: number | null;
            sku: string;
            name: string;
            category: string | null;
            price: number | null;
            brand: string | null;
            material: string | null;
            dimensions: string | null;
            stockKey: string;
            stockQty: string | null;
            acfKeysSample: string[];
            errors: string[];
            warnings: string[];
        }> = [];

        let processed = 0;
        let errorRows = 0;

        for (let page = 1; processed < effectiveLimit; page++) {
            const res = await axios.get(`${domain}/wp-json/wc/v3/products`, {
                params: { per_page: perPage, page },
                auth: { username: key, password: secret },
            });
            const wooProducts: any[] = Array.isArray(res.data) ? res.data : [];
            if (wooProducts.length === 0) break;

            for (const wp of wooProducts) {
                if (processed >= effectiveLimit) break;
                processed++;

                const errors: string[] = [];
                const warnings: string[] = [];

                const wooId = integrationImportNumericId(wp?.id);
                const skuRaw = (wp?.sku || "").toString().trim();
                const effectiveSku =
                    skuRaw ||
                    (generateSkuForMissing && wooId != null ? placeholderSkuWooCommerce(wooId) : "");
                if (!skuRaw) {
                    if (generateSkuForMissing && wooId != null) {
                        warnings.push(
                            `Nessuno SKU su Woo: in import verrà usato il provvisorio ${effectiveSku} (poi modificabile in Iris).`
                        );
                    } else {
                        errors.push("SKU mancante (non importabile).");
                    }
                }

                const name = (wp?.name || "").toString().trim();
                if (!name) warnings.push("Nome prodotto vuoto.");

                const priceNum = parsePrice(wp?.regular_price ?? null);
                if (wp?.regular_price != null && priceNum == null) warnings.push("Prezzo regular_price non valido.");

                const wooAttrs = Array.isArray(wp?.attributes) ? wp.attributes : [];
                const brand = getWooAttr(wooAttrs, effectiveBrandAttr);
                const material = getWooAttr(wooAttrs, effectiveMaterialAttr);
                const dimensions = getWooAttr(wooAttrs, effectiveDimensionsAttr);

                const category = Array.isArray(wp?.categories) ? (wp.categories?.[0]?.name ?? null) : null;
                const stockQty = wp?.stock_quantity ?? null;
                const stockLocal = stockQty !== null && stockQty !== undefined ? String(stockQty) : null;

                const metaData = Array.isArray(wp?.meta_data) ? wp.meta_data : [];
                const acfKeys: string[] = [];
                if (acfToERPExtraFields && acfPrefix) {
                    for (const md of metaData) {
                        const k = md?.key;
                        if (typeof k !== "string") continue;
                        if (!k.toLowerCase().startsWith(acfPrefix.toLowerCase())) continue;
                        acfKeys.push(k);
                        if (acfKeys.length >= 8) break;
                    }
                }

                if (errors.length) errorRows++;
                items.push({
                    wooId,
                    sku: effectiveSku,
                    name,
                    category,
                    price: priceNum,
                    brand,
                    material,
                    dimensions,
                    stockKey,
                    stockQty: stockLocal,
                    acfKeysSample: acfKeys,
                    errors,
                    warnings,
                });
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            errorRows,
            items: items.slice(0, effectiveLimit),
        });
    } catch (err: any) {
        console.error("Woo preview error:", err?.response?.data || err?.message || err);
        return NextResponse.json(
            { error: "Errore anteprima import WooCommerce.", details: err?.response?.data || err?.message },
            { status: 500 }
        );
    }
}


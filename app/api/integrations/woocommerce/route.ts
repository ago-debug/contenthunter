import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import {
    normalizeWooPushOverwrite,
    wooOverwriteNeedsRemoteFetch,
    type WooPushFieldOverwrite,
} from "@/lib/channel-push-overwrite";
import {
    ensureWooGlobalAttributeTerm,
    resolveOrCreateWooCategoryId,
} from "@/lib/woocommerce-ws";
import {
    convertErpWeightToPrestaWeightField,
    parsePrestaPhysicalFloat,
    type PrestaErpWeightInputUnit,
} from "@/lib/prestashop-ws";
import { parseErpPriceToNumber, resolveErpListPriceRaw } from "@/lib/prestashop-price-from-erp";
import { resolveChannelProductImageUrl } from "@/lib/product-image-serving";
import { getCompanyIdFromHeaders } from "@/lib/auth-api";
import { runAutoIndexingAfterChannelPush } from "@/lib/search-indexing";

const wooAxiosTimeout = 120000;

const WOO_WU_CACHE_MS = 10 * 60 * 1000;
const wooWeightUnitMem = new Map<string, { value: string | null; at: number }>();

function normalizeWooDomain(domain: string): string {
    return domain.trim().replace(/\/+$/, "");
}

function formatWooRestWeight(n: number): string {
    if (!Number.isFinite(n)) return "";
    const s = n.toFixed(6).replace(/\.?0+$/, "");
    return s === "" ? "0" : s;
}

function readErpProductWeightKgLike(product: { weight?: unknown; extraFields?: unknown } | null | undefined): number | null {
    const ex =
        product?.extraFields && typeof product.extraFields === "object"
            ? (product.extraFields as Record<string, unknown>)
            : {};
    return (
        parsePrestaPhysicalFloat(product?.weight) ??
        parsePrestaPhysicalFloat(ex.prestashopWeight) ??
        parsePrestaPhysicalFloat(ex.weight)
    );
}

async function fetchWooCommerceWeightUnit(
    domain: string,
    auth: { username: string; password: string }
): Promise<string | null> {
    const base = normalizeWooDomain(domain);
    try {
        const r = await axios.get(`${base}/wp-json/wc/v3/settings/products`, {
            auth,
            timeout: wooAxiosTimeout,
            validateStatus: (s) => s >= 200 && s < 600,
        });
        if (r.status >= 400 || !Array.isArray(r.data)) return null;
        const row = r.data.find((x: unknown) => {
            if (typeof x !== "object" || x === null) return false;
            return String((x as Record<string, unknown>).id ?? "") === "woocommerce_weight_unit";
        });
        const raw =
            row != null && typeof row === "object"
                ? String((row as Record<string, unknown>).value ?? "").trim().toLowerCase()
                : "";
        if (!raw) return null;
        if (raw === "lbs" || raw === "lb") return "lb";
        if (raw === "kg" || raw === "kgs") return "kg";
        if (raw === "g") return "g";
        if (raw === "oz") return "oz";
        return raw;
    } catch {
        return null;
    }
}

async function fetchWooWeightUnitCached(
    domain: string,
    auth: { username: string; password: string }
): Promise<string | null> {
    const key = normalizeWooDomain(domain);
    const hit = wooWeightUnitMem.get(key);
    const now = Date.now();
    if (hit && now - hit.at < WOO_WU_CACHE_MS) return hit.value;
    const v = await fetchWooCommerceWeightUnit(domain, auth);
    wooWeightUnitMem.set(key, { value: v, at: now });
    return v;
}

function attrNameKey(a: any): string {
    return String(a?.name ?? "")
        .trim()
        .toLowerCase();
}

function mergeWooProductAttributes(
    existingAttrs: any[] | undefined,
    erpAttrs: any[],
    ow: WooPushFieldOverwrite,
    brand: string,
    material: string,
    dim: string,
    extraNamesLower: Set<string>
): any[] {
    const ex = [...(existingAttrs || [])];
    const erp = [...erpAttrs];
    const brandL = brand.trim().toLowerCase();
    const matL = material.trim().toLowerCase();
    const dimL = dim.trim().toLowerCase();
    const byBrand = (a: any) => brandL.length > 0 && attrNameKey(a) === brandL;
    const isMatDimOrExtra = (a: any) => {
        const n = attrNameKey(a);
        return (matL.length > 0 && n === matL) || (dimL.length > 0 && n === dimL) || extraNamesLower.has(n);
    };

    if (!ow.brand && !ow.attributesExtra) return ex;
    if (ow.brand && ow.attributesExtra) return erp;
    if (ow.brand && !ow.attributesExtra) {
        const withoutBrand = ex.filter((a) => !byBrand(a));
        const brandFromErp = erp.find(byBrand);
        return brandFromErp ? [...withoutBrand, brandFromErp] : withoutBrand;
    }
    const withoutExtra = ex.filter((a) => !isMatDimOrExtra(a));
    const fromErp = erp.filter(isMatDimOrExtra);
    return [...withoutExtra, ...fromErp];
}

/** Allinea a PrestaShop: push lunghi (immagini, categorie, termini). Su Vercel Hobby il tetto resta ~10s. */
export const maxDuration = 300;

export type WooMapping = {
    brandAttributeName?: string;
    materialAttributeName?: string;
    dimensionsAttributeName?: string;
    extrasToAttributes?: boolean;
    /** Come è espresso il peso in scheda Iris (conversione → unità Woo «Impostazioni → Prodotti»). Default kg. */
    erpWeightInputUnit?: PrestaErpWeightInputUnit;
    stockQuantityERPKey?: "stockLocal" | "stockSupplier";
    acfMetaPrefix?: string;
    acfToERPExtraFields?: boolean;
    acfToWooMeta?: boolean;
    /** ID categoria Woo se sync categoria disattivata o prodotto senza categoria ERP */
    defaultCategoryId?: number;
    /** id genitore per nuove categorie Woo (0 = radice) */
    categoryParentId?: number;
    syncManufacturer?: boolean;
    syncCategoryFromProduct?: boolean;
    categoryResolveCache?: Record<string, number>;
    manufacturerResolveCache?: Record<string, number>;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get("domain");
    const key = searchParams.get("key");
    const secret = searchParams.get("secret");

    if (!domain || !key || !secret) {
        return NextResponse.json({ error: "Missing configuration" }, { status: 400 });
    }

    try {
        const response = await axios.get(`${domain}/wp-json/wc/v3/products`, {
            params: { per_page: 5 },
            auth: {
                username: key,
                password: secret,
            },
        });

        const sampleProduct = response.data[0] || {};
        const fields = Object.keys(sampleProduct);

        const attributeNames = Array.from(
            new Set(
                (sampleProduct?.attributes || [])
                    .map((a: any) => a?.name)
                    .filter((n: any) => typeof n === "string" && n.trim().length > 0)
            )
        );

        const sampleMetaData = Array.isArray(sampleProduct?.meta_data) ? sampleProduct.meta_data : [];
        const acfMetaKeys = Array.from(
            new Set(
                sampleMetaData
                    .map((m: any) => m?.key)
                    .filter((k: any) => typeof k === "string" && k.trim().toLowerCase().startsWith("acf_"))
            )
        );

        const authGet = {
            username: key,
            password: secret,
        };
        const weightUnit = await fetchWooCommerceWeightUnit(domain, authGet);

        return NextResponse.json({
            success: true,
            fields,
            sampleProduct,
            totalFound: response.data.length,
            attributeNames,
            acfMetaKeys,
            /** Unità peso negozio (`woocommerce_weight_unit`), per conversione push da anagrafica. */
            weightUnit,
        });
    } catch (err: any) {
        console.error("WooCommerce Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Impossibile connettersi a WooCommerce. Verificare Domain e API Keys.",
                details: err.response?.data || err.message,
            },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { domain, key, secret, product, mapping, overwrite } = body as {
        domain: string;
        key: string;
        secret: string;
        product: any;
        mapping?: WooMapping;
        overwrite?: Partial<WooPushFieldOverwrite>;
    };

    if (!domain || !key || !secret || !product) {
        return NextResponse.json({ error: "Data missing" }, { status: 400 });
    }

    const categoryResolveCache: Record<string, number> = {
        ...(mapping?.categoryResolveCache && typeof mapping.categoryResolveCache === "object"
            ? mapping.categoryResolveCache
            : {}),
    };
    const manufacturerResolveCache: Record<string, number> = {
        ...(mapping?.manufacturerResolveCache && typeof mapping.manufacturerResolveCache === "object"
            ? mapping.manufacturerResolveCache
            : {}),
    };

    const erpWU: PrestaErpWeightInputUnit =
        mapping?.erpWeightInputUnit === "g" || mapping?.erpWeightInputUnit === "lb"
            ? mapping.erpWeightInputUnit
            : "kg";

    const effectiveMapping: WooMapping = {
        brandAttributeName: mapping?.brandAttributeName ?? "Brand",
        materialAttributeName: mapping?.materialAttributeName ?? "Material",
        dimensionsAttributeName: mapping?.dimensionsAttributeName ?? "Dimensions",
        erpWeightInputUnit: erpWU,
        extrasToAttributes: mapping?.extrasToAttributes ?? true,
        stockQuantityERPKey: mapping?.stockQuantityERPKey ?? "stockLocal",
        acfMetaPrefix: mapping?.acfMetaPrefix ?? "acf_",
        acfToERPExtraFields: mapping?.acfToERPExtraFields ?? true,
        acfToWooMeta: mapping?.acfToWooMeta ?? true,
        defaultCategoryId:
            mapping?.defaultCategoryId != null ? Number(mapping.defaultCategoryId) : undefined,
        categoryParentId:
            mapping?.categoryParentId != null ? Number(mapping.categoryParentId) : undefined,
        syncManufacturer: mapping?.syncManufacturer !== false,
        syncCategoryFromProduct: mapping?.syncCategoryFromProduct !== false,
    };

    const defCat =
        effectiveMapping.defaultCategoryId != null &&
        Number.isFinite(effectiveMapping.defaultCategoryId) &&
        effectiveMapping.defaultCategoryId! > 0
            ? Math.floor(effectiveMapping.defaultCategoryId!)
            : undefined;
    const catParent =
        effectiveMapping.categoryParentId != null &&
        Number.isFinite(effectiveMapping.categoryParentId) &&
        effectiveMapping.categoryParentId! >= 0
            ? Math.floor(effectiveMapping.categoryParentId!)
            : 0;

    const brandAttrName = (effectiveMapping.brandAttributeName || "").toString().trim();
    const materialAttrName = (effectiveMapping.materialAttributeName || "").toString().trim();
    const dimensionsAttrName = (effectiveMapping.dimensionsAttributeName || "").toString().trim();
    const acfPrefix = (effectiveMapping.acfMetaPrefix || "acf_").toString().trim();
    const stockKey = effectiveMapping.stockQuantityERPKey ?? "stockLocal";

    const erpStockRaw = product?.extraFields?.[stockKey] ?? product?.stock ?? null;
    const erpStockNum =
        erpStockRaw !== null && erpStockRaw !== undefined ? parseInt(String(erpStockRaw), 10) || 0 : null;

    try {
        const ow = normalizeWooPushOverwrite(overwrite);
        const auth = { username: key, password: secret };

        const shopWU = await fetchWooWeightUnitCached(domain, auth);
        const rawKgLike = readErpProductWeightKgLike(product);
        let computedWeightStr: string | undefined;
        if (rawKgLike != null && Number.isFinite(rawKgLike)) {
            computedWeightStr = formatWooRestWeight(
                convertErpWeightToPrestaWeightField(rawKgLike, erpWU, shopWU)
            );
        }

        const existingRes = await axios.get(`${domain}/wp-json/wc/v3/products`, {
            params: { sku: product.sku, per_page: 1 },
            auth,
            timeout: wooAxiosTimeout,
            validateStatus: () => true,
        });

        if (existingRes.status >= 400) {
            return NextResponse.json(
                {
                    error: "Errore lettura prodotti WooCommerce (SKU).",
                    details: existingRes.data,
                    resolveCaches: {
                        categories: categoryResolveCache,
                        manufacturers: manufacturerResolveCache,
                    },
                },
                { status: 502 }
            );
        }

        const existing = Array.isArray(existingRes.data) ? existingRes.data[0] : null;
        const isCreate = !existing;

        let exFull: any = existing;
        if (existing && wooOverwriteNeedsRemoteFetch(ow)) {
            const fr = await axios.get(`${domain}/wp-json/wc/v3/products/${existing.id}`, {
                auth,
                timeout: wooAxiosTimeout,
                validateStatus: () => true,
            });
            if (fr.status < 400 && fr.data) exFull = fr.data;
        }

        let wooCategories: { id: number }[] = [];
        const useErpCategories = isCreate || ow.categories !== false;
        if (useErpCategories && effectiveMapping.syncCategoryFromProduct !== false) {
            let catLabel = String(product?.category ?? "").trim();
            const erpCatId = product?.categoryId != null ? Number(product.categoryId) : NaN;
            if (!catLabel && Number.isFinite(erpCatId) && erpCatId > 0) {
                try {
                    const companyId = product?.companyId != null ? Number(product.companyId) : NaN;
                    const row = await prisma.category.findFirst({
                        where: {
                            id: erpCatId,
                            ...(Number.isFinite(companyId) && companyId > 0 ? { companyId } : {}),
                        },
                        select: { name: true },
                    });
                    catLabel = String(row?.name ?? "").trim();
                } catch {
                    /* ignore */
                }
            }
            if (catLabel) {
                try {
                    const cid = await resolveOrCreateWooCategoryId(
                        domain,
                        key,
                        secret,
                        catLabel,
                        { parent: catParent },
                        categoryResolveCache
                    );
                    if (cid != null && cid > 0) wooCategories.push({ id: cid });
                } catch (cErr) {
                    console.warn("[woocommerce] category resolve/create skipped:", cErr);
                }
            }
        }

        if (useErpCategories && wooCategories.length === 0 && defCat != null) {
            wooCategories.push({ id: defCat });
        }

        if (!useErpCategories && Array.isArray(exFull?.categories) && exFull.categories.length > 0) {
            wooCategories = exFull.categories
                .map((c: any) => ({ id: Number(c.id) }))
                .filter((c: any) => Number.isFinite(c.id) && c.id > 0);
        }

        const skipBrand = !isCreate && !ow.brand;
        const skipAttrParts = !isCreate && !ow.attributesExtra;
        const extraAttrNamesLower = new Set<string>();

        const attributes: any[] = [];

        if (!skipBrand && brandAttrName && product.brand) {
            const brandStr = String(product.brand).trim();
            if (brandStr) {
                if (effectiveMapping.syncManufacturer) {
                    try {
                        const ensured = await ensureWooGlobalAttributeTerm(
                            domain,
                            key,
                            secret,
                            brandAttrName,
                            brandStr,
                            manufacturerResolveCache
                        );
                        if (ensured != null) {
                            attributes.push({
                                id: ensured.attributeId,
                                name: brandAttrName,
                                visible: true,
                                variation: false,
                                options: [ensured.optionName],
                            });
                        } else {
                            attributes.push({
                                name: brandAttrName,
                                visible: true,
                                variation: false,
                                options: [brandStr],
                            });
                        }
                    } catch (mErr) {
                        console.warn("[woocommerce] brand term skipped:", mErr);
                        attributes.push({
                            name: brandAttrName,
                            visible: true,
                            variation: false,
                            options: [brandStr],
                        });
                    }
                } else {
                    attributes.push({
                        name: brandAttrName,
                        visible: true,
                        variation: false,
                        options: [brandStr],
                    });
                }
            }
        }
        if (!skipAttrParts && materialAttrName && product.material) {
            attributes.push({
                name: materialAttrName,
                visible: true,
                variation: false,
                options: [String(product.material)],
            });
        }
        if (!skipAttrParts && dimensionsAttrName && product.dimensions) {
            attributes.push({
                name: dimensionsAttrName,
                visible: true,
                variation: false,
                options: [String(product.dimensions)],
            });
        }

        if (
            !skipAttrParts &&
            effectiveMapping.extrasToAttributes &&
            product.extraFields &&
            typeof product.extraFields === "object"
        ) {
            const skipKeys = new Set(["stockLocal", "stockSupplier", "dimensions", "material", "weight"]);
            for (const [k, v] of Object.entries(product.extraFields)) {
                if (skipKeys.has(k)) continue;
                if (effectiveMapping.acfToWooMeta && acfPrefix && k.toLowerCase().startsWith(acfPrefix.toLowerCase())) continue;
                const value = v?.toString?.().trim?.() ?? "";
                if (!value) continue;
                extraAttrNamesLower.add(k.toLowerCase());
                attributes.push({
                    name: k,
                    visible: true,
                    variation: false,
                    options: [value],
                });
            }
        }

        const metaEntries: { key: string; value: string }[] = [];
        if (effectiveMapping.acfToWooMeta && acfPrefix && product.extraFields && typeof product.extraFields === "object") {
            for (const [k, v] of Object.entries(product.extraFields)) {
                if (!k || !k.toLowerCase().startsWith(acfPrefix.toLowerCase())) continue;
                const value = v?.toString?.().trim?.() ?? "";
                if (!value) continue;
                metaEntries.push({ key: k, value });
            }
        }

        const erpPriceRaw = resolveErpListPriceRaw(product);
        const erpPriceStr =
            erpPriceRaw != null && String(erpPriceRaw).trim() !== ""
                ? String(erpPriceRaw).trim()
                : "";
        const erpPriceNum = parseErpPriceToNumber(erpPriceRaw);
        const exRegular =
            exFull?.regular_price != null && String(exFull.regular_price).trim() !== ""
                ? String(exFull.regular_price).trim()
                : "";
        const regularPriceWoo =
            erpPriceStr && Number.isFinite(erpPriceNum)
                ? erpPriceStr
                : !isCreate && exRegular
                  ? exRegular
                  : erpPriceStr;

        const wooProduct: Record<string, unknown> = {
            name: product.title,
            type: "simple",
            regular_price: regularPriceWoo,
            description: product.description || "",
            short_description: product.docDescription || "",
            sku: product.sku,
            categories: wooCategories,
            images: (product.images || []).map((img: any) => ({
                src: resolveChannelProductImageUrl(String(img.url || "").trim()),
            })),
            attributes,
            ...(erpStockNum !== null
                ? {
                      manage_stock: true,
                      stock_quantity: erpStockNum,
                  }
                : {}),
        };

        if (metaEntries.length > 0) {
            wooProduct.meta_data = metaEntries;
        }

        const payload: Record<string, unknown> = { ...wooProduct };

        if (!isCreate && exFull) {
            if (!ow.title) payload.name = exFull.name;
            if (!ow.description) payload.description = exFull.description;
            if (!ow.shortDescription) payload.short_description = exFull.short_description;
            if (!ow.price) payload.regular_price = exFull.regular_price;
            if (!ow.images) payload.images = exFull.images;
            if (!ow.categories) payload.categories = exFull.categories;
            if (!ow.stock) {
                payload.stock_quantity = exFull.stock_quantity;
                payload.manage_stock = exFull.manage_stock;
            }
            payload.attributes = mergeWooProductAttributes(
                exFull.attributes,
                attributes,
                ow,
                brandAttrName,
                materialAttrName,
                dimensionsAttrName,
                extraAttrNamesLower
            );

            if (!ow.acfMeta) {
                payload.meta_data = exFull.meta_data;
            } else if (metaEntries.length > 0) {
                const keys = new Set(metaEntries.map((m) => m.key));
                payload.meta_data = [
                    ...(Array.isArray(exFull.meta_data)
                        ? exFull.meta_data.filter(
                              (m: any) => m && typeof m.key === "string" && !keys.has(m.key)
                          )
                        : []),
                    ...metaEntries,
                ];
            } else {
                payload.meta_data = exFull.meta_data;
            }

            if (!ow.weight) {
                if (exFull.weight != null && String(exFull.weight).trim() !== "") {
                    payload.weight = exFull.weight;
                }
            } else if (computedWeightStr !== undefined && computedWeightStr !== "") {
                payload.weight = computedWeightStr;
            } else if (exFull.weight != null && String(exFull.weight).trim() !== "") {
                payload.weight = exFull.weight;
            }
        } else if (isCreate && computedWeightStr !== undefined && computedWeightStr !== "") {
            payload.weight = computedWeightStr;
        }

        const response = existing
            ? await axios.put(`${domain}/wp-json/wc/v3/products/${existing.id}`, payload, {
                  auth,
                  timeout: wooAxiosTimeout,
                  validateStatus: () => true,
              })
            : await axios.post(`${domain}/wp-json/wc/v3/products`, payload, {
                  auth,
                  timeout: wooAxiosTimeout,
                  validateStatus: () => true,
              });

        if (response.status >= 400) {
            return NextResponse.json(
                {
                    error: "Errore WooCommerce durante salvataggio prodotto.",
                    details: response.data,
                    resolveCaches: {
                        categories: categoryResolveCache,
                        manufacturers: manufacturerResolveCache,
                    },
                },
                { status: 502 }
            );
        }

        const companyIdForIndexing = getCompanyIdFromHeaders(req);
        const permalink =
            typeof response.data?.permalink === "string" ? response.data.permalink.trim() : "";
        if (companyIdForIndexing != null && permalink) {
            void runAutoIndexingAfterChannelPush(companyIdForIndexing, [permalink]).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            wooId: response.data.id,
            action: existing ? "updated" : "created",
            data: response.data,
            resolveCaches: {
                categories: categoryResolveCache,
                manufacturers: manufacturerResolveCache,
            },
        });
    } catch (err: any) {
        console.error("WooCommerce Push Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Errore durante la pubblicazione su WooCommerce.",
                details: err.response?.data || err.message,
                resolveCaches: {
                    categories: categoryResolveCache,
                    manufacturers: manufacturerResolveCache,
                },
            },
            { status: 500 }
        );
    }
}

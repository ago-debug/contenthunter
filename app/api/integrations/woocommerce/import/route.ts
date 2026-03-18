import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

function parsePrice(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw)
        .trim()
        .replace(/[^0-9.,-]/g, "")
        .replace(",", ".");
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

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const {
            domain,
            key,
            secret,
            limit = 20,
            mapping,
            overwrite = {
                base: true,
                texts: true,
                price: true,
                extras: true,
                images: true,
            },
        } = body as {
            domain: string;
            key: string;
            secret: string;
            limit?: number;
            mapping?: {
                brandAttributeName?: string;
                materialAttributeName?: string;
                dimensionsAttributeName?: string;
                extrasToERPExtraFields?: boolean;
                // Woo stock_quantity -> ERP extraFields (stockLocal/stockSupplier)
                stockQuantityERPKey?: "stockLocal" | "stockSupplier";
                // ACF meta_data keys (tipicamente "acf_")
                acfMetaPrefix?: string;
                acfToERPExtraFields?: boolean;
            };
            overwrite?: {
                base?: boolean;
                texts?: boolean;
                price?: boolean;
                extras?: boolean;
                images?: boolean;
            };
        };

        if (!domain || !key || !secret) {
            return NextResponse.json({ error: "Data missing" }, { status: 400 });
        }

        const effectiveLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 20;
        const perPage = 25; // Woo default-ish, keep small to not time out

        let processed = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

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

                const sku = (wp?.sku || "").toString().trim();
                if (!sku) {
                    skipped++;
                    continue;
                }

                const wooAttrs = Array.isArray(wp?.attributes) ? wp.attributes : [];

                const effectiveBrandAttr = (mapping?.brandAttributeName ?? "Brand").toString();
                const effectiveMaterialAttr = (mapping?.materialAttributeName ?? "Material").toString();
                const effectiveDimensionsAttr = (mapping?.dimensionsAttributeName ?? "Dimensions").toString();
                const extrasToERPExtraFields = mapping?.extrasToERPExtraFields ?? true;
                const stockKey = mapping?.stockQuantityERPKey ?? "stockLocal";
                const acfPrefix = (mapping?.acfMetaPrefix ?? "acf_").toString().trim();
                const acfToERPExtraFields = mapping?.acfToERPExtraFields ?? true;

                const brandName = getWooAttr(wooAttrs, effectiveBrandAttr);
                const material = getWooAttr(wooAttrs, effectiveMaterialAttr);
                const dimensions = getWooAttr(wooAttrs, effectiveDimensionsAttr);

                const categoryName = Array.isArray(wp?.categories) ? wp.categories?.[0]?.name ?? null : null;
                const priceNum = parsePrice(wp?.regular_price ?? null);

                // Resolve brand/category ids (auto-create)
                let resolvedBrandId: number | null = null;
                if (brandName) {
                    const dbBrand = await prisma.brand.findFirst({
                        where: { companyId: ctx.companyId, name: brandName },
                        select: { id: true },
                    });
                    if (dbBrand) resolvedBrandId = dbBrand.id;
                    else {
                        const createdBrand = await prisma.brand.create({
                            data: { companyId: ctx.companyId, name: brandName },
                            select: { id: true },
                        });
                        resolvedBrandId = createdBrand.id;
                    }
                }

                let resolvedCatId: number | null = null;
                if (categoryName) {
                    const dbCat = await prisma.category.findFirst({
                        where: { companyId: ctx.companyId, name: categoryName, parentId: null },
                        select: { id: true },
                    });
                    if (dbCat) resolvedCatId = dbCat.id;
                    else {
                        const createdCat = await prisma.category.create({
                            data: { companyId: ctx.companyId, name: categoryName, parentId: null },
                            select: { id: true },
                        });
                        resolvedCatId = createdCat.id;
                    }
                }

                try {
                    const existing = await prisma.product.findFirst({
                        where: { companyId: ctx.companyId, sku },
                        select: { id: true },
                    });

                    const baseData: any = {};
                    if (overwrite?.base) {
                        baseData.brand = brandName || null;
                        baseData.brandId = resolvedBrandId;
                        baseData.category = categoryName || null;
                        baseData.categoryId = resolvedCatId;
                    }

                    let productId: number;
                    if (!existing) {
                        const createdProduct = await prisma.product.create({
                            data: {
                                companyId: ctx.companyId,
                                sku,
                                brand: baseData.brand ?? (brandName || null),
                                brandId: baseData.brandId ?? resolvedBrandId,
                                category: baseData.category ?? (categoryName || null),
                                categoryId: baseData.categoryId ?? resolvedCatId,
                            },
                            select: { id: true },
                        });
                        productId = createdProduct.id;
                        created++;
                    } else {
                        productId = existing.id;
                        if (Object.keys(baseData).length > 0) {
                            await prisma.product.update({
                                where: { id: productId },
                                data: baseData,
                            });
                        }
                        updated++;
                    }

                    const title = (wp?.name || "").toString();
                    const description = wp?.description ?? "";
                    const shortDescription = wp?.short_description ?? "";

                    if (overwrite?.texts) {
                        await prisma.productText.upsert({
                            where: {
                                productId_language: { productId, language: "it" },
                            },
                            update: {
                                title: title || null,
                                description: typeof description === "string" ? description : String(description ?? ""),
                                docDescription:
                                    typeof shortDescription === "string" ? shortDescription : String(shortDescription ?? ""),
                            },
                            create: {
                                productId,
                                language: "it",
                                title: title || null,
                                description: typeof description === "string" ? description : String(description ?? ""),
                                docDescription:
                                    typeof shortDescription === "string" ? shortDescription : String(shortDescription ?? ""),
                            },
                        });
                    }

                    if (priceNum !== null && (overwrite?.price || !existing)) {
                        await prisma.productPrice.upsert({
                            where: { productId_listName: { productId, listName: "default" } },
                            update: { price: priceNum },
                            create: { productId, listName: "default", price: priceNum, currency: "EUR" },
                        });
                    }

                    // Legacy extras -> ProductExtra
                    if (overwrite?.extras || !existing) {
                        const extrasToSet: Record<string, string> = {};

                        if (dimensions) extrasToSet.dimensions = dimensions;
                        if (material) extrasToSet.material = material;

                        // Map Woo stock_quantity -> stockLocal
                        const stockQty = wp?.stock_quantity ?? null;
                        const stockLocal = stockQty !== null && stockQty !== undefined ? String(stockQty) : null;
                        if (stockLocal && stockLocal.trim() !== "") extrasToSet[stockKey] = stockLocal;

                        // Map all other Woo attributes into ERP extraFields (key = attribute name)
                        if (extrasToERPExtraFields) {
                            for (const a of wooAttrs) {
                                const attrName = (a?.name || "").toString().trim();
                                if (!attrName) continue;

                                const attrNameLower = attrName.toLowerCase();
                                const brandLower = effectiveBrandAttr.toLowerCase();
                                const materialLower = effectiveMaterialAttr.toLowerCase();
                                const dimensionsLower = effectiveDimensionsAttr.toLowerCase();

                                // Skip attributes mapped to legacy fields already
                                if (attrNameLower === brandLower) continue;
                                if (attrNameLower === materialLower) continue;
                                if (attrNameLower === dimensionsLower) continue;

                                const opt0 = Array.isArray(a?.options) ? a.options[0] : null;
                                const val = (opt0 ?? "").toString().trim();
                                if (!val) continue;

                                extrasToSet[attrName] = val;
                            }
                        }

                        // Map ACF custom fields from Woo meta_data -> ERP extraFields
                        if (acfToERPExtraFields && acfPrefix) {
                            const metaData = Array.isArray(wp?.meta_data) ? wp.meta_data : [];
                            for (const md of metaData) {
                                const mKey = md?.key;
                                if (typeof mKey !== "string") continue;
                                if (!mKey.toLowerCase().startsWith(acfPrefix.toLowerCase())) continue;
                                const mVal = md?.value;
                                const valStr = mVal === null || mVal === undefined ? "" : mVal.toString().trim();
                                if (!valStr) continue;
                                extrasToSet[mKey] = valStr;
                            }

                            // Fallback: if Woo response exposes `acf` object directly
                            const acfObj = wp?.acf;
                            if (acfObj && typeof acfObj === "object" && !Array.isArray(acfObj)) {
                                for (const [k, v] of Object.entries(acfObj as any)) {
                                    if (!k) continue;
                                    const fullKey = k.toLowerCase().startsWith(acfPrefix.toLowerCase()) ? k : `${acfPrefix}${k}`;
                                    const valStr = v === null || v === undefined ? "" : v.toString().trim();
                                    if (!valStr) continue;
                                    extrasToSet[fullKey] = valStr;
                                }
                            }
                        }

                        for (const [k, v] of Object.entries(extrasToSet)) {
                            if (!v || !v.toString().trim()) continue;
                            await prisma.productExtra.upsert({
                                where: { productId_key: { productId, key: k } },
                                update: { value: v.toString() },
                                create: { productId, key: k, value: v.toString() },
                            });
                        }
                    }

                    // Images
                    const wooImages: string[] = (wp?.images || [])
                        .map((i: any) => (i?.src || "").toString().trim())
                        .filter(Boolean);

                    if (overwrite?.images || !existing) {
                        if (wooImages.length > 0) {
                            const existingImgs = await prisma.productImage.findMany({
                                where: { productId },
                                select: { imageUrl: true },
                            });
                            const existingSet = new Set(existingImgs.map((ei: any) => ei.imageUrl));

                            // If overwrite images enabled: remove ones not present
                            if (overwrite?.images) {
                                await prisma.productImage.deleteMany({
                                    where: { productId, imageUrl: { notIn: wooImages } },
                                });
                            }

                            for (const imgUrl of wooImages) {
                                if (existingSet.has(imgUrl)) continue;
                                await prisma.productImage.create({ data: { productId, imageUrl: imgUrl } });
                            }
                        }
                    }
                } catch (rowErr: any) {
                    errors++;
                    console.error("Woo import row error:", rowErr?.response?.data || rowErr?.message || rowErr);
                }
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            created,
            updated,
            skipped,
            errors,
        });
    } catch (err: any) {
        console.error("Woo import error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Errore durante l'importazione da WooCommerce.",
                details: err.response?.data || err.message,
            },
            { status: 500 }
        );
    }
}


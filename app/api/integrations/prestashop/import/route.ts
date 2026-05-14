import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import {
    createPrestaShopClient,
    extractLocalizedField,
    fetchVatRatePercentForTaxRulesGroup,
    flattenPsResource,
    prestashopIsoToLangCode,
    prestashopPublicImageUrl,
    prestashopShopOrigin,
    prestashopApiBase,
} from "@/lib/prestashop-ws";
import { prestashopNetToErpGrossInclVat } from "@/lib/prestashop-price-from-erp";
import { isVatSchemaUnavailableError } from "@/lib/vat-schema-fallback";
import {
    integrationImportNumericId,
    placeholderSkuPrestashop,
    readGenerateSkuForMissingChannelSku,
} from "@/lib/integration-import-placeholder-sku";

/** Campi base scheda prodotto (senza dimensioni / codici alternativi). */
const PS_PRODUCT_DISPLAY =
    "[id,reference,price,id_category_default,id_manufacturer,ean13,name,description,description_short,id_default_image]";

/** Include attributi fisici e codici per sync completo su ProductExtra. */
const PS_PRODUCT_DISPLAY_EXTENDED =
    "[id,reference,price,id_category_default,id_manufacturer,ean13,name,description,description_short,id_default_image,weight,width,height,depth,unity,upc,isbn,mpn,id_tax_rules_group]";

/**
 * Alcune versioni/config PS rifiutano singoli campi nel `display` → 400 e nostro 422.
 * Ordine: dal più leggero al fallback `full` (pagine piccole).
 */
const PS_PRODUCT_LIST_MODES: { display: string; pageSize: number }[] = [
    { display: PS_PRODUCT_DISPLAY_EXTENDED, pageSize: 25 },
    { display: PS_PRODUCT_DISPLAY, pageSize: 25 },
    {
        display:
            "[id,reference,price,id_category_default,id_manufacturer,ean13,name,description,description_short]",
        pageSize: 25,
    },
    {
        display: "[id,reference,price,id_category_default,id_manufacturer,name,description,description_short]",
        pageSize: 25,
    },
    { display: "full", pageSize: 8 },
];

/** Su Vercel estende il limite; su Plesk regola nginx `proxy_read_timeout` se serve. */
export const maxDuration = 300;

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

/** Associa un codice IVA azienda quando l’aliquota % coincide con il gruppo tasse PrestaShop. */
function pickVatCodeIdForRate(
    vatCodes: { id: number; ratePercent: unknown }[],
    rate: number
): number | null {
    if (!Number.isFinite(rate)) return null;
    for (const v of vatCodes) {
        const r = Number(v.ratePercent);
        if (Math.abs(r - rate) < 0.051) return v.id;
    }
    return null;
}

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    try {
        const companyId = ctx.companyId;
        const body = await req.json();
        const {
            shopUrl,
            apiKey,
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
            shopUrl: string;
            apiKey: string;
            limit?: number;
            mapping?: {
                languageId?: number;
                stockQuantityERPKey?: "stockLocal" | "stockSupplier";
                idShop?: number | null;
            };
            overwrite?: {
                base?: boolean;
                texts?: boolean;
                price?: boolean;
                extras?: boolean;
                images?: boolean;
            };
            generateSkuForMissingPrestaSku?: boolean;
            generateSkuForMissingChannelSku?: boolean;
        };

        if (!shopUrl?.trim() || !apiKey?.trim()) {
            return NextResponse.json({ error: "Data missing" }, { status: 400 });
        }

        const generateSkuForMissing = readGenerateSkuForMissingChannelSku(
            body as Record<string, unknown>,
            "prestashop"
        );

        const effectiveLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 20;
        const languageId = Number(mapping?.languageId) > 0 ? Number(mapping?.languageId) : 1;
        const stockKey = mapping?.stockQuantityERPKey === "stockSupplier" ? "stockSupplier" : "stockLocal";
        const idShopNum = mapping?.idShop != null ? Number(mapping.idShop) : NaN;

        const base = prestashopApiBase(shopUrl);
        const shopOrigin = prestashopShopOrigin(shopUrl);
        const client = createPrestaShopClient(base, apiKey, {
            idShop: Number.isFinite(idShopNum) && idShopNum > 0 ? idShopNum : undefined,
        });

        let companyVatCodes: { id: number; ratePercent: unknown }[] = [];
        try {
            companyVatCodes = await prisma.vatCode.findMany({
                where: { companyId },
                select: { id: true, ratePercent: true },
            });
        } catch {
            companyVatCodes = [];
        }
        const taxGroupRateCache = new Map<number, number | null>();

        const brandResolvedCache = new Map<string, { id: number; name: string }>();
        const categoryResolvedCache = new Map<string, number>();

        const resolveBrandRow = async (
            name: string | null | undefined
        ): Promise<{ id: number; name: string } | null> => {
            const n = (name || "").trim();
            if (!n) return null;
            const hit = brandResolvedCache.get(n);
            if (hit) return hit;
            let row = await prisma.brand.findFirst({
                where: { companyId, name: n },
                select: { id: true, name: true },
            });
            if (!row) {
                row = await prisma.brand.create({
                    data: { companyId, name: n },
                    select: { id: true, name: true },
                });
            }
            brandResolvedCache.set(n, row);
            return row;
        };

        const resolveCategoryRootId = async (name: string | null | undefined): Promise<number | null> => {
            const n = (name || "").trim();
            if (!n) return null;
            const hit = categoryResolvedCache.get(n);
            if (hit != null) return hit;
            let row = await prisma.category.findFirst({
                where: { companyId, name: n, parentId: null },
                select: { id: true },
            });
            if (!row) {
                row = await prisma.category.create({
                    data: { companyId, name: n, parentId: null },
                    select: { id: true },
                });
            }
            categoryResolvedCache.set(n, row.id);
            return row.id;
        };

        const [catRes, manRes, langRes] = await Promise.all([
            client.get("/categories", {
                params: {
                    output_format: "JSON",
                    display: "[id,name]",
                    limit: "0,500",
                },
            }),
            client.get("/manufacturers", {
                params: {
                    output_format: "JSON",
                    display: "[id,name]",
                    limit: "0,500",
                },
            }),
            client.get("/languages", {
                params: {
                    output_format: "JSON",
                    display: "[id,iso_code,active]",
                    limit: "0,50",
                },
            }),
        ]);

        const catRows = catRes.status < 400 ? flattenPsResource<any>(catRes.data, "categories") : [];
        const catIdToName = new Map<string, string>();
        for (const c of catRows) {
            catIdToName.set(String(c.id), extractLocalizedField(c.name, languageId));
        }

        const manRows = manRes.status < 400 ? flattenPsResource<any>(manRes.data, "manufacturers") : [];
        const manIdToName = new Map<string, string>();
        for (const m of manRows) {
            const mn = extractLocalizedField(m.name, languageId).trim() || String(m.name ?? "").trim();
            manIdToName.set(String(m.id), mn);
        }

        const psLanguages = flattenPsResource<any>(langRes.data, "languages").filter(
            (l: any) => String(l?.active ?? "1") === "1"
        );

        /** Categoria default assente dal batch categorie (es. oltre il limit iniziale). */
        const ensurePsCategoryName = async (psCatId: string): Promise<string | null> => {
            const id = String(psCatId || "").trim();
            if (!id) return null;
            const cached = catIdToName.get(id);
            if (cached && cached.trim()) return cached.trim();
            try {
                const r = await client.get(`/categories/${id}`, {
                    params: { output_format: "JSON", display: "[id,name]" },
                });
                if (r.status >= 400) return null;
                const rows = flattenPsResource<any>(r.data, "categories");
                const row = rows[0];
                const n = row ? extractLocalizedField(row.name, languageId).trim() : "";
                if (n) catIdToName.set(id, n);
                return n || null;
            } catch {
                return null;
            }
        };

        const psProductsError = (res: { status: number; data: unknown }) => {
            const details =
                typeof res.data === "string" ? res.data.slice(0, 2000) : res.data;
            const flat =
                typeof details === "string" ? details : JSON.stringify(details ?? "");
            const detailsSnippet = flat.replace(/\s+/g, " ").trim().slice(0, 280);
            const authHint =
                res.status === 401 || res.status === 403
                    ? "Verifica URL negozio (deve puntare al negozio, es. https://shop.tld), chiave webservice e permessi GET sulla risorsa «products». Se usi multistore, prova a svuotare «ID negozio» nel modale o usa l’ID corretto."
                    : undefined;
            const invalidDisplay =
                res.status === 400 && flat.toLowerCase().includes("display")
                    ? "Il negozio ha rifiutato l’elenco campi richiesto; il server ha provato modalità alternative automaticamente."
                    : undefined;
            const statusOut =
                res.status === 401 || res.status === 403
                    ? 401
                    : res.status >= 500
                      ? 502
                      : 422;
            return NextResponse.json(
                {
                    error: "Il webservice PrestaShop non ha restituito l’elenco prodotti.",
                    details,
                    detailsSnippet: detailsSnippet || undefined,
                    upstreamStatus: res.status,
                    hint: authHint || invalidDisplay,
                },
                { status: statusOut }
            );
        };

        let listDisplay = "";
        let listPageSize = 25;
        let lastProbeBad: { status: number; data: unknown } | null = null;

        for (const mode of PS_PRODUCT_LIST_MODES) {
            const probe = await client.get("/products", {
                params: {
                    output_format: "JSON",
                    display: mode.display,
                    sort: "id_DESC",
                    limit: "0,1",
                },
            });
            if (probe.status < 400) {
                listDisplay = mode.display;
                listPageSize = mode.pageSize;
                break;
            }
            lastProbeBad = probe;
            if (probe.status === 401 || probe.status === 403) {
                return psProductsError(probe);
            }
        }

        if (!listDisplay && lastProbeBad) {
            return psProductsError(lastProbeBad);
        }

        let processed = 0;
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let skippedMissingReference = 0;
        let errors = 0;
        let offset = 0;

        while (processed < effectiveLimit) {
            const res = await client.get("/products", {
                params: {
                    output_format: "JSON",
                    display: listDisplay,
                    sort: "id_DESC",
                    limit: `${offset},${listPageSize}`,
                },
            });

            if (res.status >= 400) {
                return psProductsError(res);
            }

            const psProducts: any[] = flattenPsResource(res.data, "products");
            if (psProducts.length === 0) break;

            for (const pp of psProducts) {
                if (processed >= effectiveLimit) break;
                processed++;

                const psProductId = integrationImportNumericId(pp?.id);
                const refRaw = (pp?.reference || "").toString().trim();
                let sku = refRaw;
                if (!sku) {
                    if (!generateSkuForMissing || psProductId == null) {
                        skipped++;
                        skippedMissingReference++;
                        continue;
                    }
                    sku = placeholderSkuPrestashop(psProductId);
                }

                /** PrestaShop `price` nel webservice è imponibile (IVA esclusa). */
                const priceNetPs = parsePrice(pp?.price ?? null);

                let ratePercent: number | null = null;
                const taxGroupRaw = pp?.id_tax_rules_group;
                if (taxGroupRaw != null && String(taxGroupRaw).trim() !== "" && String(taxGroupRaw) !== "0") {
                    const gid = parseInt(String(taxGroupRaw), 10);
                    if (Number.isFinite(gid) && gid > 0) {
                        if (!taxGroupRateCache.has(gid)) {
                            taxGroupRateCache.set(
                                gid,
                                await fetchVatRatePercentForTaxRulesGroup(client, gid)
                            );
                        }
                        ratePercent = taxGroupRateCache.get(gid) ?? null;
                    }
                }

                const priceForErp =
                    priceNetPs !== null ? prestashopNetToErpGrossInclVat(priceNetPs, ratePercent) : null;
                const matchedVatId =
                    ratePercent != null ? pickVatCodeIdForRate(companyVatCodes, ratePercent) : null;

                const catId = pp?.id_category_default != null ? String(pp.id_category_default) : "";
                let categoryName: string | null = catId ? catIdToName.get(catId) || null : null;
                if (catId && !categoryName) {
                    categoryName = await ensurePsCategoryName(catId);
                }

                const manId = pp?.id_manufacturer != null ? String(pp.id_manufacturer) : "";
                let brandName: string | null =
                    manId && manId !== "0" ? manIdToName.get(manId) || null : null;
                if (manId && manId !== "0" && !brandName) {
                    try {
                        const mr = await client.get(`/manufacturers/${manId}`, {
                            params: { output_format: "JSON", display: "[id,name]" },
                        });
                        if (mr.status < 400) {
                            const mrows = flattenPsResource<any>(mr.data, "manufacturers");
                            const nmRaw = mrows[0]?.name;
                            const nm = (
                                nmRaw != null ? extractLocalizedField(nmRaw, languageId) : ""
                            ).trim();
                            if (nm) {
                                manIdToName.set(manId, nm);
                                brandName = nm;
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const qtyRaw = pp?.quantity ?? pp?.stock_quantity ?? null;
                const stockLocal =
                    qtyRaw !== null && qtyRaw !== undefined && String(qtyRaw).trim() !== ""
                        ? String(qtyRaw)
                        : null;

                const rawImg = pp?.id_default_image;
                let imgId = "";
                if (rawImg != null) {
                    if (typeof rawImg === "object" && rawImg !== null && "id" in rawImg) {
                        imgId = String((rawImg as { id?: unknown }).id ?? "").replace(/\D/g, "");
                    } else {
                        imgId = String(rawImg).replace(/\D/g, "");
                    }
                }

                try {
                    const existing = await prisma.product.findFirst({
                        where: { companyId, sku },
                        select: { id: true },
                    });

                    const baseData: Prisma.ProductUncheckedUpdateInput = {};
                    if (overwrite?.base) {
                        if (catId) {
                            if (categoryName) {
                                baseData.category = categoryName;
                                const cid = await resolveCategoryRootId(categoryName);
                                if (cid != null) baseData.categoryId = cid;
                            }
                            /* Se PS ha id categoria ma nome non risolvibile: non azzerare FK esistente */
                        } else {
                            baseData.category = null;
                            baseData.categoryId = null;
                        }

                        if (brandName) {
                            const br = await resolveBrandRow(brandName);
                            if (br) {
                                baseData.brandId = br.id;
                                baseData.brand = br.name;
                            }
                        } else {
                            baseData.brandId = null;
                            baseData.brand = null;
                        }

                        const eanRaw = pp?.ean13 != null ? String(pp.ean13).trim() : "";
                        baseData.ean = eanRaw ? eanRaw.slice(0, 191) : null;

                        /* Allineamento a categoria principale PS: evita sottocategorie ERP orfane */
                        baseData.subCategoryId = null;
                        baseData.subSubCategoryId = null;

                        if (matchedVatId != null) {
                            baseData.vatCodeId = matchedVatId;
                        }
                    }

                    let productId: number;
                    if (!existing) {
                        const createPayload: Prisma.ProductUncheckedCreateInput = {
                            companyId,
                            sku,
                            brand: (baseData.brand as string | null | undefined) ?? null,
                            brandId: (baseData.brandId as number | null | undefined) ?? null,
                            category: (baseData.category as string | null | undefined) ?? null,
                            categoryId: (baseData.categoryId as number | null | undefined) ?? null,
                            subCategoryId: null,
                            subSubCategoryId: null,
                            ean: (baseData.ean as string | null | undefined) ?? null,
                            vatCodeId:
                                overwrite?.base !== false ? matchedVatId ?? null : null,
                        };
                        try {
                            const createdProduct = await prisma.product.create({
                                data: createPayload,
                                select: { id: true },
                            });
                            productId = createdProduct.id;
                        } catch (createErr) {
                            if (!isVatSchemaUnavailableError(createErr)) throw createErr;
                            const { vatCodeId: _v, ...withoutVat } = createPayload;
                            const createdProduct = await prisma.product.create({
                                data: withoutVat,
                                select: { id: true },
                            });
                            productId = createdProduct.id;
                        }
                        created++;
                    } else {
                        productId = existing.id;
                        if (overwrite?.base) {
                            try {
                                await prisma.product.update({
                                    where: { id: productId },
                                    data: baseData,
                                });
                            } catch (updErr) {
                                if (!isVatSchemaUnavailableError(updErr)) throw updErr;
                                const { vatCodeId: _v, ...withoutVat } = baseData;
                                await prisma.product.update({
                                    where: { id: productId },
                                    data: withoutVat,
                                });
                            }
                        }
                        updated++;
                    }

                    if (overwrite?.texts) {
                        if (psLanguages.length === 0) {
                            const title = extractLocalizedField(pp?.name, languageId);
                            const description = extractLocalizedField(pp?.description, languageId);
                            const shortDescription = extractLocalizedField(pp?.description_short, languageId);
                            await prisma.productText.upsert({
                                where: {
                                    productId_language: { productId, language: "it" },
                                },
                                update: {
                                    title: title || null,
                                    description: description || null,
                                    docDescription: shortDescription || null,
                                },
                                create: {
                                    productId,
                                    language: "it",
                                    title: title || null,
                                    description: description || null,
                                    docDescription: shortDescription || null,
                                },
                            });
                        } else {
                            for (const pl of psLanguages) {
                                const lid = Number(pl.id);
                                if (!Number.isFinite(lid)) continue;
                                const langCode = prestashopIsoToLangCode(pl.iso_code);
                                if (!langCode || langCode.length < 2) continue;

                                const title = extractLocalizedField(pp?.name, lid);
                                const description = extractLocalizedField(pp?.description, lid);
                                const shortDescription = extractLocalizedField(pp?.description_short, lid);

                                if (!title && !description && !shortDescription) continue;

                                await prisma.productText.upsert({
                                    where: {
                                        productId_language: { productId, language: langCode },
                                    },
                                    update: {
                                        title: title || null,
                                        description: description || null,
                                        docDescription: shortDescription || null,
                                    },
                                    create: {
                                        productId,
                                        language: langCode,
                                        title: title || null,
                                        description: description || null,
                                        docDescription: shortDescription || null,
                                    },
                                });
                            }
                        }
                    }

                    if (priceForErp !== null && (overwrite?.price || !existing)) {
                        await prisma.productPrice.upsert({
                            where: { productId_listName: { productId, listName: "default" } },
                            update: { price: priceForErp },
                            create: { productId, listName: "default", price: priceForErp, currency: "EUR" },
                        });
                    }

                    const upsertExtra = async (key: string, value: string) => {
                        const v = String(value).trim();
                        if (!v) return;
                        await prisma.productExtra.upsert({
                            where: { productId_key: { productId, key } },
                            update: { value: v },
                            create: { productId, key, value: v },
                        });
                    };

                    /* Sempre: ID PrestaShop + ID categoria PS (tracciamento / integrazioni). */
                    const psPid = String(pp.id ?? "").trim();
                    if (psPid) await upsertExtra("prestashopProductId", psPid);
                    if (catId) await upsertExtra("prestashopCategoryId", catId);
                    if (manId && manId !== "0") await upsertExtra("prestashopManufacturerId", manId);
                    const taxG = pp?.id_tax_rules_group;
                    if (taxG != null && String(taxG).trim() !== "" && String(taxG) !== "0") {
                        await upsertExtra("prestashopTaxRulesGroupId", String(taxG));
                    }

                    if (overwrite?.extras || !existing) {
                        if (stockLocal) await upsertExtra(stockKey, stockLocal);

                        const physical: { ps: string; erp: string }[] = [
                            { ps: "weight", erp: "prestashopWeight" },
                            { ps: "width", erp: "prestashopWidth" },
                            { ps: "height", erp: "prestashopHeight" },
                            { ps: "depth", erp: "prestashopDepth" },
                            { ps: "unity", erp: "prestashopUnity" },
                            { ps: "upc", erp: "upc" },
                            { ps: "isbn", erp: "isbn" },
                            { ps: "mpn", erp: "mpn" },
                        ];
                        for (const { ps, erp } of physical) {
                            const raw = pp?.[ps];
                            if (raw == null || String(raw).trim() === "") continue;
                            await upsertExtra(erp, String(raw).trim());
                        }
                    }

                    if (overwrite?.images && imgId) {
                        const imageUrl = prestashopPublicImageUrl(shopOrigin, imgId);
                        const existingImgs = await prisma.productImage.findMany({
                            where: { productId },
                            select: { imageUrl: true },
                        });
                        const exists = existingImgs.some((e) => e.imageUrl === imageUrl);
                        if (!exists) {
                            await prisma.productImage.create({
                                data: { productId, imageUrl },
                            });
                        }
                    }
                } catch (rowErr: any) {
                    errors++;
                    console.error("PrestaShop import row error:", rowErr?.response?.data || rowErr?.message || rowErr);
                }
            }

            offset += listPageSize;
            if (psProducts.length < listPageSize) break;
        }

        return NextResponse.json({
            success: true,
            processed,
            created,
            updated,
            skipped,
            skippedMissingReference,
            errors,
            generateSkuForMissingChannelSku: !!generateSkuForMissing,
        });
    } catch (err: any) {
        console.error("PrestaShop import error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                error: "Errore durante l'importazione da PrestaShop.",
                details: err.response?.data || err.message,
            },
            { status: 500 }
        );
    }
}

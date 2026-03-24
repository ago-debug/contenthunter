import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { isVatSchemaUnavailableError } from "@/lib/vat-schema-fallback";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const body = await req.json();
        const {
            sku, title, description, docDescription, price, category, brand, brandId,
            dimensions, weight, material, bulletPoints, seoAiText, images, extraFields, catalogId, ean, parentSku,
            overwrite
        } = body;

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        // Prisma `String` (senza @db.Text) su MySQL/MariaDB può esplodere con valori molto lunghi.
        // Clamp difensivo per evitare 500 massivi durante push/import.
        const clampVarchar = (v: unknown, max = 191): string | null => {
            if (v === undefined || v === null) return null;
            const s = String(v).trim();
            if (!s) return null;
            return s.length > max ? s.slice(0, max) : s;
        };
        const clampText = (v: unknown): string | null => {
            if (v === undefined || v === null) return null;
            const s = String(v);
            return s.length > 65000 ? s.slice(0, 65000) : s;
        };

        const cleanSku = clampVarchar(sku, 191) || "";
        const cleanEan = clampVarchar(ean, 191);
        const cleanParentSku = clampVarchar(parentSku, 191);
        const cleanBrand = clampVarchar(brand, 191);
        const cleanCategory = clampVarchar(category, 191);
        if (!cleanSku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        const overwriteBrand: boolean = overwrite?.brand === true;
        const overwriteCategory: boolean = overwrite?.category === true;
        const overwriteEan: boolean = overwrite?.ean === true;
        const overwriteParentSku: boolean = overwrite?.parentSku === true;
        const overwriteTitle: boolean = overwrite?.title === true;
        const overwriteLongDescription: boolean = overwrite?.longDescription === true;
        const overwriteBulletPoints: boolean = overwrite?.bulletPoints === true;
        const overwriteSeoAi: boolean = overwrite?.seoAiText === true;
        const overwritePrice: boolean = overwrite?.price === true;
        const overwriteExtras: boolean = overwrite?.extras === true;
        const overwriteImages: boolean = overwrite?.images === true;

        // 1. Find existing product (scoped by company)
        // Priorità: SKU prima, poi EAN. Import Lab / PIM identificano la riga per SKU; se l’EAN è
        // condiviso o duplicato in staging, un match EAN-first aggiornava un altro prodotto e la scheda
        // corretta (SKU) restava vuota.
        let existingProduct = null;
        existingProduct = await prisma.product.findFirst({
            where: { companyId, sku: cleanSku }
        });
        if (!existingProduct && cleanEan) {
            existingProduct = await prisma.product.findFirst({
                where: { companyId, ean: cleanEan }
            });
        }

        // 1.5 Auto-create Brand and Categories from string values (e.g. from File Import)
        let resolvedBrandId = brandId ? Number(brandId) : undefined;
        // Evita FK error: brandId deve esistere e appartenere alla company corrente.
        if (resolvedBrandId !== undefined && !Number.isNaN(resolvedBrandId)) {
            const brandExists = await prisma.brand.findFirst({
                where: { id: resolvedBrandId, companyId },
                select: { id: true },
            });
            if (!brandExists) {
                resolvedBrandId = undefined;
            }
        }
        try {
            if (cleanBrand && !resolvedBrandId) {
                const cleanBrandName = cleanBrand;
                if (cleanBrandName) {
                    let dbBrand = await prisma.brand.findFirst({ where: { companyId, name: cleanBrandName } });
                    if (!dbBrand) {
                        dbBrand = await prisma.brand.create({ data: { companyId, name: cleanBrandName } });
                    }
                    resolvedBrandId = dbBrand.id;
                }
            }
        } catch (brandErr) {
            console.warn("[AUTO-BRAND] Skipped:", brandErr);
        }

        // Parse category hierarchy IDs robustly:
        // - if the field is missing (undefined), we should not update that level
        // - if the field is explicitly null, we should clear that level
        // - avoid "truthy" checks so IDs like `0` (if ever used) don't get dropped
        const hasCategoryId = Object.prototype.hasOwnProperty.call(body, "categoryId");
        const hasSubCategoryId = Object.prototype.hasOwnProperty.call(body, "subCategoryId");
        const hasSubSubCategoryId = Object.prototype.hasOwnProperty.call(body, "subSubCategoryId");

        const parseNullableId = (val: any): number | null | undefined => {
            if (val === undefined) return undefined;
            if (val === null) return null;
            const s = String(val).trim();
            if (!s) return null;
            const n = Number(s);
            if (Number.isNaN(n)) return undefined;
            return n;
        };

        let resolvedCatId: number | null | undefined = hasCategoryId ? parseNullableId(body.categoryId) : undefined;
        let resolvedSubCatId: number | null | undefined = hasSubCategoryId ? parseNullableId(body.subCategoryId) : undefined;
        let resolvedSubSubCatId: number | null | undefined = hasSubSubCategoryId ? parseNullableId(body.subSubCategoryId) : undefined;

        try {
            // Auto-category should only run when IDs are genuinely missing (`undefined`),
            // not when they are explicitly cleared by the UI (`null`).
            if (
                cleanCategory &&
                (resolvedCatId === undefined || resolvedSubCatId === undefined || resolvedSubSubCatId === undefined)
            ) {
                const cleanCatString = cleanCategory;
                if (cleanCatString) {
                    // Supporta separatori tipici per gerarchie: ">" oppure "/", "|" (oltre a varianti con spazi)
                    const parts = cleanCatString
                        .split(/>\s*|\s*\/\s*|\s*\|\s*|›\s*|»\s*|→\s*|->\s*/g)
                        .map((s: string) => s.trim())
                        .filter((s: string) => s.length > 0);
                    if (parts.length > 0) {
                        let cat1 = await prisma.category.findFirst({ where: { companyId, name: parts[0], parentId: null } });
                        if (!cat1) cat1 = await prisma.category.create({ data: { companyId, name: parts[0], parentId: null } });
                        resolvedCatId = cat1.id;
                        if (parts.length > 1) {
                            let cat2 = await prisma.category.findFirst({ where: { companyId, name: parts[1], parentId: cat1.id } });
                            if (!cat2) cat2 = await prisma.category.create({ data: { companyId, name: parts[1], parentId: cat1.id } });
                            resolvedSubCatId = cat2.id;
                            if (parts.length > 2) {
                                let cat3 = await prisma.category.findFirst({ where: { companyId, name: parts[2], parentId: cat2.id } });
                                if (!cat3) cat3 = await prisma.category.create({ data: { companyId, name: parts[2], parentId: cat2.id } });
                                resolvedSubSubCatId = cat3.id;
                            }
                        }
                    }
                }
            }
        } catch (catErr) {
            console.warn("[AUTO-CATEGORY] Skipped:", catErr);
        }

        // 2. Create or Update base Product HUB
        let product;
        if (existingProduct) {
            // Usa sempre SKU/EAN come indici: lo SKU esistente NON viene mai sovrascritto.
            const updateData: any = {};
            if (overwriteBrand) {
                updateData.brand = cleanBrand || undefined;
                updateData.brandId = resolvedBrandId;
            }
            if (overwriteCategory) {
                updateData.category = cleanCategory || undefined;
                updateData.categoryId = resolvedCatId;
                updateData.subCategoryId = resolvedSubCatId;
                updateData.subSubCategoryId = resolvedSubSubCatId;
            }
            if (overwriteEan) {
                updateData.ean = cleanEan || undefined;
            }
            if (overwriteParentSku) {
                updateData.parentSku = cleanParentSku || undefined;
            }

            if (Object.keys(updateData).length > 0) {
                product = await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: updateData,
                });
            } else {
                product = existingProduct;
            }
        } else {
            product = await prisma.product.create({
                data: {
                    companyId,
                    sku: cleanSku,
                    brand: cleanBrand,
                    brandId: resolvedBrandId || null,
                    category: cleanCategory,
                    categoryId: resolvedCatId || null,
                    subCategoryId: resolvedSubCatId || null,
                    subSubCategoryId: resolvedSubSubCatId || null,
                    ean: cleanEan,
                    parentSku: cleanParentSku,
                },
            });
        }

        // 2.1 Codice IVA (opzionale; collegato a tabella VatCode)
        if (Object.prototype.hasOwnProperty.call(body, "vatCodeId")) {
            try {
                const raw = (body as any).vatCodeId;
                let vatId: number | null = null;
                if (raw === null || raw === "") {
                    vatId = null;
                } else {
                    const n = parseInt(String(raw), 10);
                    if (Number.isNaN(n)) {
                        return NextResponse.json({ error: "Codice IVA (vatCodeId) non valido" }, { status: 400 });
                    }
                    const vc = await prisma.vatCode.findFirst({
                        where: { id: n, companyId },
                    });
                    if (!vc) {
                        return NextResponse.json({ error: "Codice IVA non trovato per questa azienda" }, { status: 400 });
                    }
                    vatId = n;
                }
                product = await prisma.product.update({
                    where: { id: product.id },
                    data: { vatCodeId: vatId },
                });
            } catch (vatErr) {
                if (isVatSchemaUnavailableError(vatErr)) {
                    console.warn(
                        "[POST /api/products] Salvataggio vatCodeId ignorato: schema IVA non presente (npx prisma db push)"
                    );
                } else {
                    throw vatErr;
                }
            }
        }

        // 2. Upsert Italian texts con controllo di campo per sovrascrittura
        if (title !== undefined || description !== undefined || docDescription !== undefined || bulletPoints !== undefined || seoAiText !== undefined) {
            let existingText: any = null;
            if (existingProduct) {
                existingText = await prisma.productText.findUnique({
                    where: {
                        productId_language: { productId: existingProduct.id, language: "it" }
                    }
                });
            }

            const finalTitle =
                !existingText ? clampVarchar(title, 191)
                    : overwriteTitle && title !== undefined ? clampVarchar(title, 191)
                        : existingText.title ?? null;

            const finalDescription =
                !existingText ? clampText(description)
                    : overwriteLongDescription && description !== undefined ? clampText(description)
                        : existingText.description ?? null;

            const finalDocDescription =
                !existingText ? clampText(docDescription)
                    : docDescription !== undefined ? clampText(docDescription)
                        : existingText.docDescription ?? null;

            const finalBulletPoints =
                !existingText ? clampText(bulletPoints)
                    : overwriteBulletPoints && bulletPoints !== undefined ? clampText(bulletPoints)
                        : existingText.bulletPoints ?? null;

            const finalSeoAi =
                !existingText ? clampText(seoAiText)
                    : overwriteSeoAi && seoAiText !== undefined ? clampText(seoAiText)
                        : existingText.seoAiText ?? null;

            await prisma.productText.upsert({
                where: {
                    productId_language: { productId: product.id, language: "it" }
                },
                update: {
                    title: finalTitle,
                    description: finalDescription,
                    docDescription: finalDocDescription,
                    bulletPoints: finalBulletPoints,
                    seoAiText: finalSeoAi
                },
                create: {
                    productId: product.id,
                    language: "it",
                    title: finalTitle,
                    description: finalDescription,
                    docDescription: finalDocDescription,
                    bulletPoints: finalBulletPoints,
                    seoAiText: finalSeoAi
                }
            });
        }

        // 3. Upsert Default Price (solo se autorizzato oppure se il prodotto è nuovo)
        if (price !== undefined && price !== null && price !== "") {
            const priceStr = price.toString().replace(/[^0-9.,-]/g, "").replace(",", ".");
            const parsedPrice = parseFloat(priceStr);
            if (!isNaN(parsedPrice) && (!existingProduct || overwritePrice)) {
                await prisma.productPrice.upsert({
                    where: {
                        productId_listName: { productId: product.id, listName: "default" }
                    },
                    update: { price: parsedPrice },
                    create: { productId: product.id, listName: "default", price: parsedPrice }
                });
            }
        }

        // 4. Handle "Old" hardcoded fields mapping them to Extra EAV just in case
        const hasExtraValue = (v: unknown): boolean => {
            if (v === undefined || v === null) return false;
            // Evita `if (v)` che scarta 0, "0", ecc.
            return String(v).trim() !== "";
        };

        if (!existingProduct || overwriteExtras) {
            const legacyExtras = [
                { key: "dimensions", value: dimensions },
                { key: "weight", value: weight },
                { key: "material", value: material }
            ];

            for (const leg of legacyExtras) {
                if (hasExtraValue(leg.value)) {
                    const str = String(leg.value);
                    await prisma.productExtra.upsert({
                        where: { productId_key: { productId: product.id, key: leg.key } },
                        update: { value: str },
                        create: { productId: product.id, key: leg.key, value: str }
                    });
                }
            }

            // 5. Handle truly dynamic extra fields
            if (extraFields && typeof extraFields === 'object') {
                for (const [key, value] of Object.entries(extraFields)) {
                    if (hasExtraValue(value)) {
                        const safeKey = clampVarchar(key, 191);
                        if (!safeKey) continue;
                        const str = String(value);
                        await prisma.productExtra.upsert({
                            where: { productId_key: { productId: product.id, key: safeKey } },
                            update: { value: str },
                            create: { productId: product.id, key: safeKey, value: str }
                        });
                    }
                }
            }
        }

        // 6. Handle relationships with Catalog (Projects)
        if (catalogId) {
            await prisma.catalogEntry.upsert({
                where: { catalogId_productId: { catalogId: parseInt(catalogId), productId: product.id } },
                update: {},
                create: { catalogId: parseInt(catalogId), productId: product.id }
            });
        }

        // 7. Handle Tags
        if (body.productTags && Array.isArray(body.productTags)) {
            await prisma.productTag.deleteMany({
                where: { productId: product.id }
            });

            if (body.productTags.length > 0) {
                await prisma.productTag.createMany({
                    data: body.productTags.map((pt: any) => ({
                        productId: product.id,
                        tagId: parseInt(pt.tagId)
                    }))
                });
            }
        }

        // 8. Handle Translations
        if (body.translations && typeof body.translations === 'object') {
            for (const [lang, data] of Object.entries(body.translations)) {
                const d = data as any;
                await prisma.productText.upsert({
                    where: { productId_language: { productId: product.id, language: lang } },
                    update: {
                        title: d.title || null,
                        description: d.description || null,
                        bulletPoints: d.bulletPoints || null,
                        seoAiText: d.seoAiText || null
                    },
                    create: {
                        productId: product.id,
                        language: lang,
                        title: d.title || null,
                        description: d.description || null,
                        bulletPoints: d.bulletPoints || null,
                        seoAiText: d.seoAiText || null
                    }
                });
            }
        }

        // 8.5 Sync BulletPoints to Relational Table
        try {
            const itBulletsStr = (body.translations?.['it']?.bulletPoints !== undefined)
                ? body.translations['it'].bulletPoints
                : bulletPoints;

            if (itBulletsStr !== undefined) {
                await prisma.bulletPoint.deleteMany({
                    where: { productId: product.id }
                });
                if (itBulletsStr) {
                    const lines = itBulletsStr
                        .split('\n')
                        .map((l: string) => { let cl = l.trim(); if (cl.startsWith('- ')) cl = cl.substring(2); if (cl.startsWith('* ')) cl = cl.substring(2); return cl.trim(); })
                        .filter((l: string) => l.length > 0);
                    if (lines.length > 0) {
                        await prisma.bulletPoint.createMany({
                            data: lines.map((l: string) => ({
                                content: l,
                                productId: product.id,
                                companyId,
                            }))
                        });
                    }
                }
            }
        } catch (bpErr) {
            console.warn("[BULLET-SYNC] Skipped:", bpErr);
        }

        // 9. Handle Images
        // - Nuovi prodotti: sempre scriviamo le immagini se presenti
        // - Prodotti esistenti: scriviamo SOLO se esplicitamente richiesto (overwriteImages === true)
        if (images && Array.isArray(images) && (!existingProduct || overwriteImages)) {
            await prisma.productImage.deleteMany({
                where: { productId: product.id }
            });

            if (images.length > 0) {
                await prisma.productImage.createMany({
                    data: images.map((img: any) => ({
                        productId: product.id,
                        imageUrl: img.url || img.imageUrl
                    }))
                });
            }
        }

        // 8. Log modification to History
        await prisma.productHistory.create({
            data: {
                productId: product.id,
                data: {
                    sku: cleanSku,
                    ean: cleanEan,
                    parentSku: cleanParentSku,
                    brand: cleanBrand,
                    category: cleanCategory,
                    title: clampVarchar(title, 191),
                    description: clampText(description),
                    docDescription: clampText(docDescription),
                    bulletPoints: clampText(bulletPoints),
                    seoAiText: clampText(seoAiText),
                    price: price, // stored as provided
                    extraFields: extraFields || {},
                    timestamp: new Date().toISOString()
                } as any
            }
        });

        return NextResponse.json({ success: true, productId: product.id });
    } catch (err: any) {
        console.error("Product save error details:", err);
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === "P2003") {
                return NextResponse.json(
                    {
                        error: "Relazione non valida (foreign key)",
                        details:
                            "Controlla brand/categoria associati al catalogo: uno degli ID collegati non esiste per questa azienda.",
                        prismaCode: err.code,
                        meta: err.meta,
                    },
                    { status: 400 }
                );
            }
            if (err.code === "P2002") {
                return NextResponse.json(
                    {
                        error: "Vincolo di unicita violato",
                        details:
                            "Esiste gia un record con lo stesso valore su un campo univoco (es. SKU nella stessa azienda).",
                        prismaCode: err.code,
                        meta: err.meta,
                    },
                    { status: 400 }
                );
            }
        }
        return NextResponse.json({
            error: "Save failed",
            details: err.message
        }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { searchParams } = new URL(req.url);
        const catalogId = searchParams.get("catalogId");
        const sku = searchParams.get("sku");
        const ean = searchParams.get("ean");

        const where: any = { companyId };
        if (catalogId) {
            where.catalogs = { some: { catalogId: parseInt(catalogId) } };
        }
        if (sku) {
            where.sku = sku;
        }
        if (ean) {
            where.ean = ean;
        }

        const productIncludeBase = {
            texts: true,
            prices: { where: { listName: "default" as const } },
            extraFields: true,
            images: { select: { id: true, imageUrl: true } },
            tags: { include: { tag: true } },
            brandRef: true,
            bulletPointRefs: true,
        };

        let products: any[];
        try {
            products = await prisma.product.findMany({
                where,
                include: { ...productIncludeBase, vatCode: true },
                orderBy: { createdAt: "desc" },
            });
        } catch (err) {
            if (!isVatSchemaUnavailableError(err)) throw err;
            console.warn(
                "[GET /api/products] Schema IVA non disponibile sul DB — fallback senza relazione VatCode (eseguire: npx prisma db push)"
            );
            try {
                products = await prisma.product.findMany({
                    where,
                    include: productIncludeBase,
                    orderBy: { createdAt: "desc" },
                });
            } catch (err2) {
                if (!isVatSchemaUnavailableError(err2)) throw err2;
                products = await prisma.product.findMany({
                    where,
                    include: productIncludeBase,
                    omit: { vatCodeId: true },
                    orderBy: { createdAt: "desc" },
                });
            }
        }

        const mapped = products.map((p: any) => {
            const translations: Record<string, any> = {};
            p.texts.forEach((t: any) => {
                translations[t.language] = {
                    title: t.title,
                    description: t.description,
                    bulletPoints: t.bulletPoints,
                    seoAiText: t.seoAiText,
                    docDescription: t.docDescription
                };
            });

            const itText = translations["it"] || {};
            const defPrice = p.prices?.[0] || {};

            // Build the dynamic extra fields object + reconstruct legacy
            const extraObj: Record<string, string> = {};
            let dimensions = "";
            let weight = "";
            let material = "";

            p.extraFields.forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else extraObj[ex.key] = ex.value;
            });

            const vat = p.vatCode ?? null;
            const vatRate = vat ? Number(vat.ratePercent.toString()) : null;

            return {
                id: p.id,
                sku: p.sku,
                ean: p.ean,
                parentSku: p.parentSku,
                brand: p.brand,
                category: p.category,
                vatCodeId: p.vatCodeId ?? null,
                vatCode: vat
                    ? {
                          id: vat.id,
                          code: vat.code,
                          label: vat.label,
                          ratePercent: vatRate,
                      }
                    : null,
                // Maps Text (defaults to it for compatibility)
                title: itText.title || "",
                description: itText.description || "",
                docDescription: itText.docDescription || "",
                bulletPoints: itText.bulletPoints || "",
                seoAiText: itText.seoAiText || "",
                // Translations 
                translations,
                // Price
                price: defPrice.price !== undefined ? String(defPrice.price) : "",
                // Legacy Extra
                dimensions,
                weight,
                material,
                // Dynamic Extra
                extraFields: extraObj,
                // Categories
                categoryId: p.categoryId,
                subCategoryId: p.subCategoryId,
                subSubCategoryId: p.subSubCategoryId,
                // Images
                images: p.images.map((img: any) => ({ id: img.id.toString(), url: img.imageUrl })),
                // Tags
                productTags: p.tags.map((pt: any) => ({ tagId: pt.tagId })),
                catalogId: catalogId ? parseInt(catalogId) : undefined,
                brandId: p.brandId,
                brandData: p.brandRef,
                bullets: p.bulletPointRefs
            };
        });

        return NextResponse.json(mapped);
    } catch (err: any) {
        console.error("Fetch products error details:", err);
        return NextResponse.json({
            error: "Fetch failed",
            details: err.message
        }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { searchParams } = new URL(req.url);
        const sku = searchParams.get("sku");

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        await prisma.product.delete({
            where: { companyId_sku: { companyId, sku } }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete product error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

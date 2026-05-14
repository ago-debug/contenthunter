import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { isVatSchemaUnavailableError } from "@/lib/vat-schema-fallback";
import { Prisma } from "@prisma/client";
import { normalizeStockExtraKey } from "@/lib/stock-extra";
import { normalizeLotsForDb } from "@/lib/product-lot";
import { PRODUCTS_LIST_MAX_TAKE, PRODUCTS_LIST_PAGE_SIZE } from "@/lib/fetch-all-products";
import { clientUrlForProductImage } from "@/lib/product-image-serving";
import { assertCanCreateProduct } from "@/lib/plan-limits";
import type { Session } from "next-auth";

async function resolveSaverIdentity(sessionUser: Session["user"]): Promise<{ userId: number | null; displayName: string }> {
    const uid = sessionUser?.userId;
    const emailFallback = (sessionUser?.email && String(sessionUser.email).trim()) || "Utente";
    if (!uid) {
        return { userId: null, displayName: emailFallback };
    }
    const u = await prisma.user.findUnique({
        where: { id: uid },
        select: { name: true, lastName: true, email: true },
    });
    if (!u) return { userId: uid, displayName: emailFallback };
    const parts = [u.name?.trim(), u.lastName?.trim()].filter(Boolean) as string[];
    if (parts.length) return { userId: uid, displayName: parts.join(" ") };
    return { userId: uid, displayName: (u.email && u.email.trim()) || emailFallback };
}

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId, session } = ctx;

    let stage = "init";
    try {
        stage = "parse_body";
        const body = await req.json();
        const {
            sku, title, description, docDescription, price, category, brand, brandId,
            dimensions, weight, material, bulletPoints, seoAiText, images, extraFields, catalogId, ean, parentSku,
            overwrite,
        } = body;
        const recordImportDate = body?.recordImportDate === true;
        const hasSyncCatalogIds = Object.prototype.hasOwnProperty.call(body, "syncCatalogIds");
        const syncCatalogIdsRaw = hasSyncCatalogIds ? (body as any).syncCatalogIds : undefined;

        stage = "validate_sku";
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
        const overwriteLots: boolean = overwrite?.lots === true;
        const hasLotsKey = Object.prototype.hasOwnProperty.call(body, "lots");
        const lotsRaw = hasLotsKey ? (body as { lots?: unknown }).lots : undefined;

        // 1. Find existing product (scoped by company)
        // Priorità: SKU prima, poi EAN. Import Lab / Iris identificano la riga per SKU; se l’EAN è
        // condiviso o duplicato in staging, un match EAN-first aggiornava un altro prodotto e la scheda
        // corretta (SKU) restava vuota.
        stage = "find_existing_product";
        let existingProduct = null;
        existingProduct = await prisma.product.findFirst({
            where: { companyId, sku: cleanSku },
            select: { id: true },
        });
        if (!existingProduct && cleanEan) {
            existingProduct = await prisma.product.findFirst({
                where: { companyId, ean: cleanEan },
                select: { id: true },
            });
        }

        // 1.5 Auto-create Brand and Categories from string values (e.g. from File Import)
        stage = "resolve_brand";
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

        stage = "resolve_categories";
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
        stage = "create_or_update_product";
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

            if (recordImportDate) {
                (updateData as any).importedAt = new Date();
            }
            if (Object.keys(updateData).length > 0) {
                product = await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: updateData,
                    select: { id: true },
                });
            } else {
                product = existingProduct;
            }
        } else {
            const planOk = await assertCanCreateProduct(companyId);
            if (!planOk.ok) {
                return NextResponse.json({ error: planOk.message }, { status: 403 });
            }
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
                    ...(recordImportDate ? { importedAt: new Date() } : {}),
                },
                select: { id: true },
            });
        }

        // 2.1 Codice IVA (opzionale; collegato a tabella VatCode)
        stage = "save_vat_code";
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
                    select: { id: true },
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

        // 2.05 Schede tecniche — collegamenti logistici (picklist azienda)
        stage = "technical_logistics_fk";
        const bodyAny = body as Record<string, unknown>;
        const techPatch: {
            technicalPackagingId?: number | null;
            technicalPackagingNote?: string | null;
            technicalPalettId?: number | null;
            technicalPalettNote?: string | null;
        } = {};
        const verifyPick = async (rowId: number, category: string): Promise<boolean> => {
            const row = await prisma.technicalPicklistItem.findFirst({
                where: { id: rowId, companyId, category },
                select: { id: true },
            });
            return !!row;
        };
        if ("technicalPackagingId" in bodyAny && bodyAny.technicalPackagingId !== undefined) {
            const raw = bodyAny.technicalPackagingId;
            if (raw === null || raw === "") {
                techPatch.technicalPackagingId = null;
            } else {
                const pid = parseInt(String(raw), 10);
                if (!Number.isFinite(pid)) {
                    return NextResponse.json({ error: "technicalPackagingId non valido" }, { status: 400 });
                }
                if (!(await verifyPick(pid, "logistics_packaging"))) {
                    return NextResponse.json({ error: "Packaging non valido per questa azienda" }, { status: 400 });
                }
                techPatch.technicalPackagingId = pid;
            }
        }
        if ("technicalPalettId" in bodyAny && bodyAny.technicalPalettId !== undefined) {
            const raw = bodyAny.technicalPalettId;
            if (raw === null || raw === "") {
                techPatch.technicalPalettId = null;
            } else {
                const pid = parseInt(String(raw), 10);
                if (!Number.isFinite(pid)) {
                    return NextResponse.json({ error: "technicalPalettId non valido" }, { status: 400 });
                }
                if (!(await verifyPick(pid, "logistics_palettizzazione"))) {
                    return NextResponse.json({ error: "Palettizzazione non valida" }, { status: 400 });
                }
                techPatch.technicalPalettId = pid;
            }
        }
        if ("technicalPackagingNote" in bodyAny && bodyAny.technicalPackagingNote !== undefined) {
            techPatch.technicalPackagingNote = clampText(bodyAny.technicalPackagingNote) || null;
        }
        if ("technicalPalettNote" in bodyAny && bodyAny.technicalPalettNote !== undefined) {
            techPatch.technicalPalettNote = clampText(bodyAny.technicalPalettNote) || null;
        }
        if (Object.keys(techPatch).length > 0 && product?.id) {
            try {
                await prisma.product.update({
                    where: { id: product.id },
                    data: techPatch,
                });
            } catch (e: any) {
                console.warn(
                    "[POST /api/products] Salvataggio collegamenti scheda tecnica / logistica non riuscito (eseguire `npx prisma db push`):",
                    e?.message
                );
            }
        }

        // 2. Upsert Italian texts con controllo di campo per sovrascrittura
        stage = "upsert_it_text";
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
        stage = "upsert_price";
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

        stage = "upsert_extras";
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

        // 6. Cataloghi PDF (opzionale): sostituisce tutti i collegamenti se arriva syncCatalogIds, altrimenti upsert singolo catalogId legacy
        stage = "upsert_catalog_entry";
        if (hasSyncCatalogIds && Array.isArray(syncCatalogIdsRaw)) {
            const ids = Array.from(
                new Set(
                    (syncCatalogIdsRaw as unknown[])
                        .map((x) => parseInt(String(x), 10))
                        .filter((n) => Number.isFinite(n) && n > 0)
                )
            );
            const valid = await prisma.catalog.findMany({
                where: { companyId, id: { in: ids } },
                select: { id: true },
            });
            const validIds = valid.map((c) => c.id);
            await prisma.catalogEntry.deleteMany({ where: { productId: product.id } });
            if (validIds.length > 0) {
                await prisma.catalogEntry.createMany({
                    data: validIds.map((cid) => ({ catalogId: cid, productId: product.id })),
                    skipDuplicates: true,
                });
            }
        } else if (catalogId) {
            await prisma.catalogEntry.upsert({
                where: { catalogId_productId: { catalogId: parseInt(String(catalogId), 10), productId: product.id } },
                update: {},
                create: { catalogId: parseInt(String(catalogId), 10), productId: product.id }
            });
        }

        // 7. Handle Tags
        stage = "sync_tags";
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
        stage = "sync_translations";
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
        stage = "sync_bullets";
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
        stage = "sync_images";
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

        let savedLotsSnapshot: unknown = undefined;
        stage = "sync_lots";
        if (hasLotsKey && Array.isArray(lotsRaw) && (!existingProduct || overwriteLots)) {
            try {
                const rows = normalizeLotsForDb(lotsRaw);
                await prisma.productLot.deleteMany({ where: { productId: product.id } });
                if (rows.length > 0) {
                    await prisma.productLot.createMany({
                        data: rows.map((r) => ({
                            productId: product.id,
                            lotCode: r.lotCode,
                            quantity: r.quantity,
                            expiryDate: r.expiryDate,
                            receivedAt: r.receivedAt,
                            notes: r.notes,
                            sortOrder: r.sortOrder,
                        })),
                    });
                }
                savedLotsSnapshot = rows.map((r) => ({
                    lotCode: r.lotCode,
                    quantity: r.quantity.toString(),
                    expiryDate: r.expiryDate ? r.expiryDate.toISOString() : null,
                    receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
                    notes: r.notes,
                    sortOrder: r.sortOrder,
                }));
            } catch (lotErr) {
                console.warn("[POST /api/products] Salvataggio lotti non riuscito (eseguire `npx prisma db push`):", lotErr);
            }
        }

        // 10. Log modification to History (snapshot + firma elettronica salvataggio)
        stage = "write_history";
        const saver = await resolveSaverIdentity(session.user);
        const savedAtIso = new Date().toISOString();
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
                    ...(savedLotsSnapshot !== undefined ? { lots: savedLotsSnapshot } : {}),
                    timestamp: savedAtIso,
                    savedByUserId: saver.userId,
                    savedByDisplayName: saver.displayName,
                } as any
            }
        });

        stage = "done";
        return NextResponse.json({
            success: true,
            productId: product.id,
            lastSave: { displayName: saver.displayName, savedAt: savedAtIso },
        });
    } catch (err: any) {
        console.error("Product save error details:", { stage, err });
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
            details: err.message,
            stage
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
        const preview = searchParams.get("preview") === "1";
        const limitRaw = Number(searchParams.get("limit") || "50");
        const previewLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
        const q = (searchParams.get("q") || "").trim();
        const catalogId = searchParams.get("catalogId");
        const sku = searchParams.get("sku");
        const ean = searchParams.get("ean");
        const brandId = searchParams.get("brandId");
        const categoryId = searchParams.get("categoryId");
        const subCategoryId = searchParams.get("subCategoryId");
        const subSubCategoryId = searchParams.get("subSubCategoryId");

        const takeRaw = searchParams.get("take");
        const paginate = takeRaw !== null && takeRaw !== "";
        const skipRaw = Number(searchParams.get("skip") || "0");
        const skip =
            Number.isFinite(skipRaw) && skipRaw >= 0 ? Math.floor(skipRaw) : 0;
        const takeNum = Number(takeRaw);
        const take = paginate
            ? Math.min(
                  Math.max(
                      Number.isFinite(takeNum) && takeNum > 0 ? takeNum : PRODUCTS_LIST_PAGE_SIZE,
                      1
                  ),
                  PRODUCTS_LIST_MAX_TAKE
              )
            : undefined;

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
        if (brandId) {
            const v = Number(brandId);
            if (Number.isFinite(v)) where.brandId = v;
        }
        if (categoryId) {
            const v = Number(categoryId);
            if (Number.isFinite(v)) where.categoryId = v;
        }
        if (subCategoryId) {
            const v = Number(subCategoryId);
            if (Number.isFinite(v)) where.subCategoryId = v;
        }
        if (subSubCategoryId) {
            const v = Number(subSubCategoryId);
            if (Number.isFinite(v)) where.subSubCategoryId = v;
        }
        if (q) {
            where.OR = [
                { sku: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
                { texts: { some: { language: "it", title: { contains: q, mode: "insensitive" } } } },
            ];
        }

        if (preview) {
            const previewProducts = await prisma.product.findMany({
                where,
                select: {
                    id: true,
                    sku: true,
                    brand: true,
                    texts: { where: { language: "it" }, select: { title: true } },
                    prices: { where: { listName: "default" }, select: { price: true } },
                    images: { select: { id: true, imageUrl: true, storedInDb: true }, take: 5 },
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
                take: previewLimit,
            });

            return NextResponse.json(
                previewProducts.map((p: any) => ({
                    id: p.id,
                    sku: p.sku,
                    title: p.texts?.[0]?.title || "",
                    brand: p.brand || "",
                    price: p.prices?.[0]?.price ?? "",
                    images: (p.images || []).map((img: any) => ({
                        id: String(img.id),
                        url: clientUrlForProductImage(img),
                    })),
                }))
            );
        }

        const productIncludeBase = {
            texts: true,
            prices: { where: { listName: "default" as const } },
            extraFields: true,
            images: { select: { id: true, imageUrl: true, storedInDb: true } },
            lots: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
            tags: { include: { tag: true } },
            brandRef: true,
            bulletPointRefs: true,
            catalogs: { select: { catalogId: true, catalog: { select: { id: true, name: true } } } },
            technicalPackaging: { select: { id: true, name: true, description: true } },
            technicalPalett: { select: { id: true, name: true, description: true } },
        };

        let total: number | undefined;
        if (paginate) {
            total = await prisma.product.count({ where });
        }

        const applyPagination = (args: Prisma.ProductFindManyArgs): Prisma.ProductFindManyArgs => {
            if (paginate && take !== undefined) {
                return { ...args, skip, take };
            }
            return args;
        };

        let products: any[];
        try {
            products = await prisma.product.findMany(
                applyPagination({
                    where,
                    include: { ...productIncludeBase, vatCode: true },
                    orderBy: { createdAt: "desc" },
                })
            );
        } catch (err) {
            if (!isVatSchemaUnavailableError(err)) throw err;
            console.warn(
                "[GET /api/products] Schema IVA non disponibile sul DB — fallback senza relazione VatCode (eseguire: npx prisma db push)"
            );
            try {
                products = await prisma.product.findMany(
                    applyPagination({
                        where,
                        include: productIncludeBase,
                        orderBy: { createdAt: "desc" },
                    })
                );
            } catch (err2) {
                if (!isVatSchemaUnavailableError(err2)) throw err2;
                products = await prisma.product.findMany(
                    applyPagination({
                        where,
                        include: productIncludeBase,
                        omit: { vatCodeId: true },
                        orderBy: { createdAt: "desc" },
                    })
                );
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
            let stockLocal = "";
            let stockSupplier = "";

            p.extraFields.forEach((ex: any) => {
                const stockAlias = normalizeStockExtraKey(ex.key);
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else if (stockAlias === "stockLocal") stockLocal = ex.value;
                else if (stockAlias === "stockSupplier") stockSupplier = ex.value;
                else extraObj[ex.key] = ex.value;
            });

            const parsedStockLocal = parseFloat(String(stockLocal || "").replace(",", "."));
            const normalizedStock =
                Number.isFinite(parsedStockLocal) && !Number.isNaN(parsedStockLocal)
                    ? parsedStockLocal
                    : (typeof p.stock === "number" ? p.stock : 0);

            const vat = p.vatCode ?? null;
            const vatRate = vat ? Number(vat.ratePercent.toString()) : null;

            const catalogMemberships = (p.catalogs || []).map((ce: any) => ({
                id: ce.catalog?.id,
                name: ce.catalog?.name,
            })).filter((x: any) => x.id != null);
            const catalogLinkIds = catalogMemberships.map((c: any) => c.id);

            return {
                id: p.id,
                sku: p.sku,
                ean: p.ean,
                parentSku: p.parentSku,
                brand: p.brand,
                category: p.category,
                importedAt: p.importedAt ? p.importedAt.toISOString() : null,
                catalogMemberships,
                catalogLinkIds,
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
                extraFields: {
                    ...extraObj,
                    ...(stockLocal ? { stockLocal } : {}),
                    ...(stockSupplier ? { stockSupplier } : {}),
                },
                stock: normalizedStock,
                stockSupplier: stockSupplier || "",
                // Categories
                categoryId: p.categoryId,
                subCategoryId: p.subCategoryId,
                subSubCategoryId: p.subSubCategoryId,
                // Images
                images: p.images.map((img: any) => ({
                    id: img.id.toString(),
                    url: clientUrlForProductImage(img),
                })),
                // Tags
                productTags: p.tags.map((pt: any) => ({ tagId: pt.tagId })),
                catalogId: catalogId ? parseInt(catalogId) : undefined,
                brandId: p.brandId,
                brandData: p.brandRef,
                bullets: p.bulletPointRefs,
                technicalPackagingId: p.technicalPackagingId ?? null,
                technicalPackagingNote: p.technicalPackagingNote ?? "",
                technicalPalettId: p.technicalPalettId ?? null,
                technicalPalettNote: p.technicalPalettNote ?? "",
                lots: Array.isArray(p.lots)
                    ? p.lots.map((l: any) => ({
                          id: l.id,
                          lotCode: l.lotCode ?? "",
                          quantity: l.quantity != null ? String(l.quantity) : "0",
                          expiryDate: l.expiryDate ? l.expiryDate.toISOString().slice(0, 10) : "",
                          receivedAt: l.receivedAt ? l.receivedAt.toISOString().slice(0, 10) : "",
                          notes: l.notes ?? "",
                          sortOrder: typeof l.sortOrder === "number" ? l.sortOrder : 0,
                      }))
                    : [],
            };
        });

        if (paginate) {
            const t = total ?? 0;
            return NextResponse.json({
                products: mapped,
                total: t,
                skip,
                take,
                hasMore: skip + mapped.length < t,
            });
        }

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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

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

        const cleanSku = sku.toString().trim();
        const cleanEan = ean ? ean.toString().trim() : null;

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

        // 1. Find existing product by EAN or SKU (scoped by company)
        let existingProduct = null;
        if (cleanEan) {
            existingProduct = await prisma.product.findFirst({
                where: { companyId, ean: cleanEan }
            });
        }
        if (!existingProduct) {
            existingProduct = await prisma.product.findFirst({
                where: { companyId, sku: cleanSku }
            });
        }

        // 1.5 Auto-create Brand and Categories from string values (e.g. from File Import)
        let resolvedBrandId = brandId ? Number(brandId) : undefined;
        try {
            if (brand && !resolvedBrandId) {
                const cleanBrandName = brand.toString().trim();
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

        let resolvedCatId = body.categoryId ? Number(body.categoryId) : undefined;
        let resolvedSubCatId = body.subCategoryId ? Number(body.subCategoryId) : undefined;
        let resolvedSubSubCatId = body.subSubCategoryId ? Number(body.subSubCategoryId) : undefined;

        try {
            if (category && (!resolvedCatId || !resolvedSubCatId || !resolvedSubSubCatId)) {
                const cleanCatString = category.toString().trim();
                if (cleanCatString) {
                    const parts = cleanCatString.split('>').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
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
                updateData.brand = brand || undefined;
                updateData.brandId = resolvedBrandId;
            }
            if (overwriteCategory) {
                updateData.category = category || undefined;
                updateData.categoryId = resolvedCatId;
                updateData.subCategoryId = resolvedSubCatId;
                updateData.subSubCategoryId = resolvedSubSubCatId;
            }
            if (overwriteEan) {
                updateData.ean = cleanEan || undefined;
            }
            if (overwriteParentSku) {
                updateData.parentSku = parentSku || undefined;
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
                    brand: brand || null,
                    brandId: resolvedBrandId || null,
                    category: category || null,
                    categoryId: resolvedCatId || null,
                    subCategoryId: resolvedSubCatId || null,
                    subSubCategoryId: resolvedSubSubCatId || null,
                    ean: cleanEan || null,
                    parentSku: parentSku || null
                },
            });
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
                !existingText ? (title ?? null)
                    : overwriteTitle && title !== undefined ? (title ?? null)
                        : existingText.title ?? null;

            const finalDescription =
                !existingText ? (description ?? null)
                    : overwriteLongDescription && description !== undefined ? (description ?? null)
                        : existingText.description ?? null;

            const finalDocDescription =
                !existingText ? (docDescription ?? null)
                    : docDescription !== undefined ? (docDescription ?? null)
                        : existingText.docDescription ?? null;

            const finalBulletPoints =
                !existingText ? (bulletPoints ?? null)
                    : overwriteBulletPoints && bulletPoints !== undefined ? (bulletPoints ?? null)
                        : existingText.bulletPoints ?? null;

            const finalSeoAi =
                !existingText ? (seoAiText ?? null)
                    : overwriteSeoAi && seoAiText !== undefined ? (seoAiText ?? null)
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
        if (!existingProduct || overwriteExtras) {
            const legacyExtras = [
                { key: "dimensions", value: dimensions },
                { key: "weight", value: weight },
                { key: "material", value: material }
            ];

            for (const leg of legacyExtras) {
                if (leg.value) {
                    await prisma.productExtra.upsert({
                        where: { productId_key: { productId: product.id, key: leg.key } },
                        update: { value: leg.value.toString() },
                        create: { productId: product.id, key: leg.key, value: leg.value.toString() }
                    });
                }
            }

            // 5. Handle truly dynamic extra fields
            if (extraFields && typeof extraFields === 'object') {
                for (const [key, value] of Object.entries(extraFields)) {
                    if (value) {
                        await prisma.productExtra.upsert({
                            where: { productId_key: { productId: product.id, key: key } },
                            update: { value: value.toString() },
                            create: { productId: product.id, key: key, value: value.toString() }
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
                    parentSku: parentSku || null,
                    brand: brand || null,
                    category: category || null,
                    title: title || null,
                    description: description || null,
                    docDescription: docDescription || null,
                    bulletPoints: bulletPoints || null,
                    seoAiText: seoAiText || null,
                    price: price, // stored as provided
                    extraFields: extraFields || {},
                    timestamp: new Date().toISOString()
                } as any
            }
        });

        return NextResponse.json({ success: true, productId: product.id });
    } catch (err: any) {
        console.error("Product save error details:", err);
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

        const products = await prisma.product.findMany({
            where,
            include: {
                texts: true,
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { id: true, imageUrl: true } },
                tags: { include: { tag: true } },
                brandRef: true,
                bulletPointRefs: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const mapped = products.map(p => {
            const translations: Record<string, any> = {};
            p.texts.forEach(t => {
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

            p.extraFields.forEach(ex => {
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else extraObj[ex.key] = ex.value;
            });

            return {
                id: p.id,
                sku: p.sku,
                ean: p.ean,
                parentSku: p.parentSku,
                brand: p.brand,
                category: p.category,
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
                images: p.images.map(img => ({ id: img.id.toString(), url: img.imageUrl })),
                // Tags
                productTags: p.tags.map(pt => ({ tagId: pt.tagId })),
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

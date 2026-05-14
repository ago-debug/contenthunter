import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCatalogAccess } from "@/lib/auth-api";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }

        const catalog = await prisma.catalog.findUnique({
            where: { id: catalogId },
            select: { lastListinoName: true }
        });

        const listName = (catalog?.lastListinoName && String(catalog.lastListinoName)) || "default";

        const products = await prisma.stagingProduct.findMany({
            where: { catalogId },
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName } },
                extraFields: true,
                images: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(products);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        const body = await req.json();
        const { products, lastListinoName, overwrite } = body;

        if (!Array.isArray(products)) {
            return NextResponse.json({ error: "Products array is required" }, { status: 400 });
        }

        // Update Catalog with last listino name (usato anche come listName per il prezzo)
        if (lastListinoName) {
            const normalizedName = String(lastListinoName);

            await prisma.catalog.update({
                where: { id: catalogId },
                data: { lastListinoName: normalizedName }
            });

            const existingListino = await prisma.catalogListinoFile.findFirst({
                where: {
                    catalogId,
                    fileName: normalizedName
                }
            });

            // Evita duplicati in CatalogListinoFile per stesso catalogo+file
            if (!existingListino) {
                await prisma.catalogListinoFile.create({
                    data: {
                        catalogId,
                        fileName: normalizedName
                    }
                });
            }
        }

        const listName = (lastListinoName && String(lastListinoName)) || "default";

        const overwriteOptions = {
            base: overwrite?.base !== undefined ? !!overwrite.base : true,
            texts: overwrite?.texts !== undefined ? !!overwrite.texts : true,
            price: overwrite?.price !== undefined ? !!overwrite.price : true,
            extras: overwrite?.extras !== undefined ? !!overwrite.extras : true,
        };

        const normalizeSku = (v: any) =>
            (v ? String(v).trim().toUpperCase() : "") || "";
        const normalizeEan = (v: any) =>
            (v ? String(v).replace(/[^\d]/g, "") : "") || "";

        /** Duplicati nello stesso file (stesso SKU o stesso EAN su più righe) */
        const skuOcc = new Map<string, number>();
        const eanOcc = new Map<string, number>();
        for (const raw of products) {
            const sn = normalizeSku(raw.sku);
            const en = normalizeEan(raw.ean);
            if (sn) skuOcc.set(sn, (skuOcc.get(sn) || 0) + 1);
            if (en) eanOcc.set(en, (eanOcc.get(en) || 0) + 1);
        }
        const skuCounts: Record<string, number> = {};
        const eanCounts: Record<string, number> = {};
        skuOcc.forEach((c, k) => {
            if (c > 1) skuCounts[k] = c;
        });
        eanOcc.forEach((c, k) => {
            if (c > 1) eanCounts[k] = c;
        });

        let skippedNoIdentifier = 0;
        let stagingCreated = 0;
        let stagingMergedOrUpdated = 0;
        let rowErrors = 0;

        for (const p of products) {
            try {
                const skuNorm = normalizeSku(p.sku);
                const eanNorm = normalizeEan(p.ean);

                // Unicità solo SKU / EAN (il titolo duplicato non unisce mai righe)
                if (!skuNorm && !eanNorm) {
                    skippedNoIdentifier++;
                    continue;
                }

                /**
                 * Match stretto: se la riga ha uno SKU, cerchiamo SOLO per SKU.
                 * Altrimenti cerchiamo per EAN.
                 */
                let staging = null;

                if (skuNorm) {
                    staging = await prisma.stagingProduct.findFirst({
                        where: { catalogId, sku: skuNorm },
                    });
                } else if (eanNorm) {
                    staging = await prisma.stagingProduct.findFirst({
                        where: { catalogId, ean: eanNorm },
                    });
                }

                // Se non esiste ancora, crealo
                if (!staging) {
                    staging = await prisma.stagingProduct.create({
                        data: {
                            catalogId,
                            sku: skuNorm || (p.sku ? String(p.sku) : "NO-SKU"),
                            ean: eanNorm || (p.ean ? String(p.ean) : null),
                            parentSku: p.parentSku ? String(p.parentSku) : null,
                            brand: p.brand ? String(p.brand) : null,
                            category: p.category ? String(p.category) : null,
                        },
                    });
                    stagingCreated++;
                } else {
                    stagingMergedOrUpdated++;
                    // Aggiorna campi base.
                    // - Se overwrite.base è true: aggiorna tutto come in passato.
                    // - Se overwrite.base è false: aggiorna almeno `brand`/`category` SOLO se sono vuoti in DB.
                    if (overwriteOptions.base) {
                        await prisma.stagingProduct.update({
                            where: { id: staging.id },
                            data: {
                                sku: skuNorm || staging.sku,
                                ean: eanNorm || staging.ean,
                                parentSku: p.parentSku ? String(p.parentSku) : staging.parentSku,
                                brand: p.brand ? String(p.brand) : staging.brand,
                                category: p.category ? String(p.category) : staging.category,
                            },
                        });
                    } else {
                        const incomingBrand = p.brand ? String(p.brand) : null;
                        const incomingCategory = p.category ? String(p.category) : null;
                        const updateFields: any = {};

                        if (incomingBrand && (!staging.brand || String(staging.brand).trim() === "")) {
                            updateFields.brand = incomingBrand;
                        }
                        if (
                            incomingCategory &&
                            (!staging.category || String(staging.category).trim() === "")
                        ) {
                            updateFields.category = incomingCategory;
                        }

                        if (Object.keys(updateFields).length > 0) {
                            await prisma.stagingProduct.update({
                                where: { id: staging.id },
                                data: updateFields,
                            });
                        }
                    }
                }

                // Testi (scheda prodotto) – includono anche descrizione breve / SEO
                const existingText = await prisma.stagingProductText.findFirst({
                    where: { stagingProductId: staging.id, language: "it" },
                });

                const newTitle = p.title ? String(p.title) : null;
                const newDesc = p.description ? String(p.description) : null;
                const newBullets = p.bulletPoints ? String(p.bulletPoints) : null;
                const newShort = p.shortDescription ? String(p.shortDescription) : null;
                const newSeo = p.seoText ? String(p.seoText) : null;
                const incomingShort = newSeo ?? newShort;

                const finalTitle = overwriteOptions.texts
                    ? (newTitle ?? existingText?.title ?? null)
                    : (existingText?.title ?? newTitle ?? null);
                const finalDesc = overwriteOptions.texts
                    ? (newDesc ?? existingText?.description ?? null)
                    : (existingText?.description ?? newDesc ?? null);
                const finalBullets = overwriteOptions.texts
                    ? (newBullets ?? existingText?.bulletPoints ?? null)
                    : (existingText?.bulletPoints ?? newBullets ?? null);
                const finalSeo = overwriteOptions.texts
                    ? (incomingShort ?? existingText?.seoAiText ?? null)
                    : (existingText?.seoAiText ?? incomingShort ?? null);

                await prisma.stagingProductText.upsert({
                    where: {
                        stagingProductId_language: {
                            stagingProductId: staging.id,
                            language: "it",
                        },
                    },
                    update: {
                        title: finalTitle,
                        description: finalDesc,
                        bulletPoints: finalBullets,
                        seoAiText: finalSeo,
                    },
                    create: {
                        stagingProductId: staging.id,
                        language: "it",
                        title: finalTitle,
                        description: finalDesc,
                        bulletPoints: finalBullets,
                        seoAiText: finalSeo,
                    },
                });

                // Prezzo per questo listino (listName)
                {
                    const hasIncomingPrice =
                        p.price !== undefined &&
                        p.price !== null &&
                        String(p.price).trim() !== "";

                    // Robust price parsing:
                    // 1. Remove currency symbols and other non-digit/dot/comma chars (except sign)
                    let priceStr = hasIncomingPrice ? String(p.price).replace(/[^0-9,.-]/g, "") : "";

                    // 2. Handle European format (1.234,56) vs US format (1,234.56)
                    if (priceStr.includes(',') && priceStr.includes('.')) {
                        // If both present, remove the thousands separator
                        const lastComma = priceStr.lastIndexOf(',');
                        const lastDot = priceStr.lastIndexOf('.');
                        if (lastComma > lastDot) {
                            // European: 1.234,56 -> remove dot, replace comma with dot
                            priceStr = priceStr.replace(/\./g, '').replace(',', '.');
                        } else {
                            // US: 1,234.56 -> remove comma
                            priceStr = priceStr.replace(/,/g, '');
                        }
                    } else if (priceStr.includes(',')) {
                        // Only comma: 1234,56 -> replace with dot
                        priceStr = priceStr.replace(',', '.');
                    }

                    const parsedPrice = priceStr ? parseFloat(priceStr) : NaN;
                    const hasMeaningfulPrice = Number.isFinite(parsedPrice) && parsedPrice > 0;

                    const existingPrice = await prisma.stagingProductPrice.findUnique({
                        where: {
                            stagingProductId_listName: {
                                stagingProductId: staging.id,
                                listName,
                            },
                        },
                    });

                    if (hasMeaningfulPrice) {
                        if (!existingPrice) {
                            await prisma.stagingProductPrice.create({
                                data: {
                                    stagingProductId: staging.id,
                                    listName,
                                    price: parsedPrice,
                                },
                            });
                        } else if (overwriteOptions.price) {
                            await prisma.stagingProductPrice.update({
                                where: {
                                    stagingProductId_listName: {
                                        stagingProductId: staging.id,
                                        listName,
                                    },
                                },
                                data: { price: parsedPrice },
                            });
                        }
                    } else {
                        /**
                         * Evita di "azzerare" il prezzo durante il merge.
                         * Se il file non porta un prezzo valido (>0) e per questo listino non esiste ancora un prezzo,
                         * copiamo l'ultimo prezzo disponibile da altri listini (se presente).
                         */
                        if (!existingPrice) {
                            const fallback = await prisma.stagingProductPrice.findFirst({
                                where: {
                                    stagingProductId: staging.id,
                                    price: { gt: 0 },
                                    NOT: { listName },
                                },
                                orderBy: { id: "desc" },
                            });
                            if (fallback) {
                                await prisma.stagingProductPrice.create({
                                    data: {
                                        stagingProductId: staging.id,
                                        listName,
                                        price: fallback.price,
                                    },
                                });
                            }
                        }
                    }
                }

                // Campi extra anagrafica Iris (dimensioni, peso, materiale, stock, ecc.)
                const extras: { key: string; value: any }[] = [
                    { key: "dimensions", value: p.dimensions },
                    { key: "weight", value: p.weight },
                    { key: "material", value: p.material },
                    { key: "stockLocal", value: p.stockLocal },
                    { key: "stockSupplier", value: p.stockSupplier },
                ];

                // Eventuali extra dinamici mappati a runtime (extraFields: { [key]: value })
                if (p.extraFields && typeof p.extraFields === "object") {
                    for (const [k, v] of Object.entries(p.extraFields)) {
                        extras.push({ key: k, value: v });
                    }
                }

                for (const ex of extras) {
                    if (!ex.value) continue;

                    const existingExtra = await prisma.stagingProductExtra.findUnique({
                        where: {
                            stagingProductId_key: {
                                stagingProductId: staging.id,
                                key: ex.key,
                            },
                        },
                    });

                    if (!existingExtra) {
                        await prisma.stagingProductExtra.create({
                            data: {
                                stagingProductId: staging.id,
                                key: ex.key,
                                value: String(ex.value),
                            },
                        });
                    } else if (overwriteOptions.extras) {
                        await prisma.stagingProductExtra.update({
                            where: {
                                stagingProductId_key: {
                                    stagingProductId: staging.id,
                                    key: ex.key,
                                },
                            },
                            data: { value: String(ex.value) },
                        });
                    }
                }

                // Immagini importate da listino (es. link immagine_1..5): aggiunge solo URL nuovi.
                const incomingImageUrls: string[] = Array.isArray(p.images)
                    ? Array.from(
                        new Set<string>(
                            p.images
                                .map((img: any) => {
                                    if (!img) return "";
                                    if (typeof img === "string") return img.trim();
                                    if (typeof img === "object" && img.url) return String(img.url).trim();
                                    return "";
                                })
                                .filter((url: string) => url.length > 0)
                        )
                    )
                    : [];

                if (incomingImageUrls.length > 0) {
                    const existingImages = await prisma.stagingProductImage.findMany({
                        where: { stagingProductId: staging.id },
                        select: { imageUrl: true },
                    });
                    const existingUrlSet = new Set(
                        existingImages
                            .map((i) => (i.imageUrl || "").trim())
                            .filter((u) => u.length > 0)
                    );

                    for (const imageUrl of incomingImageUrls) {
                        if (existingUrlSet.has(imageUrl)) continue;
                        await prisma.stagingProductImage.create({
                            data: {
                                stagingProductId: staging.id,
                                imageUrl,
                            },
                        });
                        existingUrlSet.add(imageUrl);
                    }
                }
            } catch (perRowErr: any) {
                rowErrors++;
                console.error("Staging POST row error (SKU:", p.sku, "):", perRowErr);
                // continua con le altre righe, senza far fallire tutta l'importazione
            }
        }

        return NextResponse.json({
            success: true,
            count: products.length,
            stats: {
                totalRowsReceived: products.length,
                skippedNoIdentifier,
                stagingCreated,
                /** Righe che hanno aggiornato uno staging già esistente (DB o riga precedente con stesso SKU/EAN/titolo) */
                stagingMergedOrUpdated,
                rowErrors,
                /** Chiavi duplicate nello stesso invio (file) */
                duplicateSkuCount: Object.keys(skuCounts).length,
                duplicateEanCount: Object.keys(eanCounts).length,
                duplicateSkuRows: Object.values(skuCounts).reduce((a, b) => a + b, 0),
                duplicateEanRows: Object.values(eanCounts).reduce((a, b) => a + b, 0),
            },
            duplicatesInBatch: {
                skuCounts,
                eanCounts,
            },
        });
    } catch (err: any) {
        console.error("Staging POST error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);

        await prisma.stagingProduct.deleteMany({ where: { catalogId } });
        await prisma.catalog.update({
            where: { id: catalogId },
            data: { lastListinoName: null }
        });
        // Rimuove anche la cronologia dei listini caricati per questo repository
        await prisma.catalogListinoFile.deleteMany({
            where: { catalogId }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

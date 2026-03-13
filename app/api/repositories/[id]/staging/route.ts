import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);

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
            await prisma.$transaction([
                prisma.catalog.update({
                    where: { id: catalogId },
                    data: { lastListinoName: normalizedName }
                }),
                prisma.catalogListinoFile.create({
                    data: {
                        catalogId,
                        fileName: normalizedName
                    }
                })
            ]);
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

        for (const p of products) {
            try {
                if (!p.sku && !p.ean && !p.title) continue; // Skip righe senza chiavi minime

                const skuNorm = normalizeSku(p.sku);
                const eanNorm = normalizeEan(p.ean);

                // 1) Prova a trovare un prodotto di staging esistente per questo catalogo
                let staging = await prisma.stagingProduct.findFirst({
                    where: {
                        catalogId,
                        OR: [
                            skuNorm ? { sku: skuNorm } : undefined,
                            eanNorm ? { ean: eanNorm } : undefined,
                        ].filter(Boolean) as any,
                    },
                });

                // 2) Fallback: match per titolo esatto, se presente e non trovato via SKU/EAN
                if (!staging && p.title) {
                    staging = await prisma.stagingProduct.findFirst({
                        where: {
                            catalogId,
                            texts: {
                                some: {
                                    language: "it",
                                    title: String(p.title),
                                },
                            },
                        },
                    });
                }

                // 3) Se non esiste ancora, crealo
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
                } else {
                    // aggiorna campi base solo se arrivano valori non vuoti
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
                    }
                }

                // Testi (scheda prodotto) – includono anche descrizione breve / SEO
                const existingText = await prisma.stagingProductText.findFirst({
                    where: { stagingProductId: staging.id, language: "it" },
                });

                const newTitle = p.title ? String(p.title) : null;
                const newDesc = p.description ? String(p.description) : null;
                const newDoc = p.shortDescription ? String(p.shortDescription) : null;
                const newBullets = p.bulletPoints ? String(p.bulletPoints) : null;
                const newSeo = p.seoText ? String(p.seoText) : null;

                const finalTitle = overwriteOptions.texts
                    ? (newTitle ?? existingText?.title ?? null)
                    : (existingText?.title ?? newTitle ?? null);
                const finalDesc = overwriteOptions.texts
                    ? (newDesc ?? existingText?.description ?? null)
                    : (existingText?.description ?? newDesc ?? null);
                const finalDoc = overwriteOptions.texts
                    ? (newDoc ?? existingText?.docDescription ?? null)
                    : (existingText?.docDescription ?? newDoc ?? null);
                const finalBullets = overwriteOptions.texts
                    ? (newBullets ?? existingText?.bulletPoints ?? null)
                    : (existingText?.bulletPoints ?? newBullets ?? null);
                const finalSeo = overwriteOptions.texts
                    ? (newSeo ?? existingText?.seoAiText ?? null)
                    : (existingText?.seoAiText ?? newSeo ?? null);

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
                        docDescription: finalDoc,
                        bulletPoints: finalBullets,
                        seoAiText: finalSeo,
                    },
                    create: {
                        stagingProductId: staging.id,
                        language: "it",
                        title: finalTitle,
                        description: finalDesc,
                        docDescription: finalDoc,
                        bulletPoints: finalBullets,
                        seoAiText: finalSeo,
                    },
                });

                // Prezzo per questo listino (listName)
                if (p.price) {
                    // Robust price parsing:
                    // 1. Remove currency symbols and other non-digit/dot/comma chars (except sign)
                    let priceStr = p.price.toString().replace(/[^0-9,.-]/g, '');

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

                    const parsedPrice = parseFloat(priceStr);
                    if (!isNaN(parsedPrice)) {
                        const existingPrice = await prisma.stagingProductPrice.findUnique({
                            where: {
                                stagingProductId_listName: {
                                    stagingProductId: staging.id,
                                    listName,
                                },
                            },
                        });

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
                    }
                }

                // Campi extra Master ERP (dimensioni, peso, materiale, stock, ecc.)
                const extras: { key: string; value: any }[] = [
                    { key: "dimensions", value: p.dimensions },
                    { key: "weight", value: p.weight },
                    { key: "material", value: p.material },
                    { key: "stockLocal", value: p.stockLocal },
                    { key: "stockSupplier", value: p.stockSupplier },
                ];

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
            } catch (perRowErr: any) {
                console.error("Staging POST row error (SKU:", p.sku, "):", perRowErr);
                // continua con le altre righe, senza far fallire tutta l'importazione
            }
        }

        return NextResponse.json({ success: true, count: products.length });
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

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

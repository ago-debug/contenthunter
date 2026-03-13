import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);

        const products = await prisma.stagingProduct.findMany({
            where: { catalogId },
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
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
        const { products, lastListinoName } = body;

        if (!Array.isArray(products)) {
            return NextResponse.json({ error: "Products array is required" }, { status: 400 });
        }

        // Update Catalog with last listino name
        if (lastListinoName) {
            await prisma.catalog.update({
                where: { id: catalogId },
                data: { lastListinoName }
            });
        }

        // Cleanup previous staging data for questo catalogo
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        for (const p of products) {
            try {
                if (!p.sku) continue; // Skip rows without SKU

                const staging = await prisma.stagingProduct.create({
                    data: {
                        catalogId,
                        sku: String(p.sku),
                        ean: p.ean ? String(p.ean) : null,
                        parentSku: p.parentSku ? String(p.parentSku) : null,
                        brand: p.brand ? String(p.brand) : null,
                        category: p.category ? String(p.category) : null,
                    }
                });

                // Testi (scheda prodotto) – includono anche descrizione breve / SEO
                await prisma.stagingProductText.create({
                    data: {
                        stagingProductId: staging.id,
                        language: "it",
                        title: p.title ? String(p.title) : null,
                        description: p.description ? String(p.description) : null,
                        docDescription: p.shortDescription ? String(p.shortDescription) : null,
                        bulletPoints: p.bulletPoints ? String(p.bulletPoints) : null,
                        seoAiText: p.seoText ? String(p.seoText) : null,
                    }
                });

                // Prezzo
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
                        await prisma.stagingProductPrice.create({
                            data: {
                                stagingProductId: staging.id,
                                price: parsedPrice
                            }
                        });
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
                    await prisma.stagingProductExtra.create({
                        data: {
                            stagingProductId: staging.id,
                            key: ex.key,
                            value: String(ex.value),
                        },
                    });
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

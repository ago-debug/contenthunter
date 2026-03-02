import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            sku, title, description, docDescription, price, category, brand,
            dimensions, weight, material, bulletPoints, seoAiText, images, extraFields, catalogId, ean, parentSku
        } = body;

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        const cleanSku = sku.toString().trim();
        const cleanEan = ean ? ean.toString().trim() : null;

        // 1. Find existing product by EAN or SKU
        let existingProduct = null;
        if (cleanEan) {
            existingProduct = await prisma.product.findUnique({
                where: { ean: cleanEan }
            });
        }

        if (!existingProduct) {
            existingProduct = await prisma.product.findUnique({
                where: { sku: cleanSku }
            });
        }

        // 2. Create or Update base Product HUB
        let product;
        if (existingProduct) {
            product = await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                    sku: cleanSku, // Allow SKU update if found by EAN
                    brand: brand || undefined,
                    category: category || undefined,
                    ean: cleanEan || undefined,
                    parentSku: parentSku || undefined
                },
            });
        } else {
            product = await prisma.product.create({
                data: {
                    sku: cleanSku,
                    brand: brand || null,
                    category: category || null,
                    ean: cleanEan || null,
                    parentSku: parentSku || null
                },
            });
        }

        // 2. Upsert Italian texts
        if (title !== undefined || description !== undefined || docDescription !== undefined || bulletPoints !== undefined || seoAiText !== undefined) {
            await prisma.productText.upsert({
                where: {
                    productId_language: { productId: product.id, language: "it" }
                },
                update: {
                    title: title || null,
                    description: description || null,
                    docDescription: docDescription || null,
                    bulletPoints: bulletPoints || null,
                    seoAiText: seoAiText || null
                },
                create: {
                    productId: product.id,
                    language: "it",
                    title: title || null,
                    description: description || null,
                    docDescription: docDescription || null,
                    bulletPoints: bulletPoints || null,
                    seoAiText: seoAiText || null
                }
            });
        }

        // 3. Upsert Default Price
        if (price !== undefined && price !== null && price !== "") {
            const priceStr = price.toString().replace(/[^0-9.,-]/g, "").replace(",", ".");
            const parsedPrice = parseFloat(priceStr);
            if (!isNaN(parsedPrice)) {
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

        // 9. Handle Images
        if (images && Array.isArray(images)) {
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
    try {
        const { searchParams } = new URL(req.url);
        const catalogId = searchParams.get("catalogId");

        // Base Product Query mapped back to flat structure for the existing Frontend
        const products = await prisma.product.findMany({
            where: catalogId ? { catalogs: { some: { catalogId: parseInt(catalogId) } } } : undefined,
            include: {
                texts: true,
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { id: true, imageUrl: true } },
                tags: { include: { tag: true } }
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
                // Images
                images: p.images.map(img => ({ id: img.id.toString(), url: img.imageUrl })),
                // Tags
                productTags: p.tags.map(pt => ({ tagId: pt.tagId })),
                catalogId: catalogId ? parseInt(catalogId) : undefined
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
    try {
        const { searchParams } = new URL(req.url);
        const sku = searchParams.get("sku");

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        await prisma.product.delete({
            where: { sku: sku }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete product error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

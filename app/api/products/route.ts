import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            sku, title, description, docDescription, price, category, brand,
            dimensions, weight, material, bulletPoints, images, extraFields, catalogId, ean, parentSku
        } = body;

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        const cleanSku = sku.toString().trim();

        // 1. Crate or Update base Product HUB
        const product = await prisma.product.upsert({
            where: { sku: cleanSku },
            update: {
                brand: brand || null,
                category: category || null,
                ean: ean || null,
                parentSku: parentSku || null
            },
            create: {
                sku: cleanSku,
                brand: brand || null,
                category: category || null,
                ean: ean || null,
                parentSku: parentSku || null
            },
        });

        // 2. Upsert Italian texts
        if (title || description || docDescription || bulletPoints) {
            await prisma.productText.upsert({
                where: {
                    productId_language: { productId: product.id, language: "it" }
                },
                update: {
                    title: title || null,
                    description: description || null,
                    docDescription: docDescription || null,
                    bulletPoints: bulletPoints || null
                },
                create: {
                    productId: product.id,
                    language: "it",
                    title: title || null,
                    description: description || null,
                    docDescription: docDescription || null,
                    bulletPoints: bulletPoints || null
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

        // 7. Handle Images
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
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { id: true, imageUrl: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const mapped = products.map(p => {
            const itText = p.texts?.[0] || {};
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
                // Maps Text
                title: itText.title || "",
                description: itText.description || "",
                docDescription: itText.docDescription || "",
                bulletPoints: itText.bulletPoints || "",
                // Maps Price
                price: defPrice.price !== undefined ? String(defPrice.price) : "",
                // Maps Legacy Extra
                dimensions,
                weight,
                material,
                // Dynamic Extra
                extraFields: extraObj,
                // Maps Images
                images: p.images.map(img => ({ id: img.id.toString(), url: img.imageUrl })),

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

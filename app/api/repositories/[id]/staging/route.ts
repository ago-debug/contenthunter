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
        const { products } = body; // Array of product objects from CSV mapping

        if (!Array.isArray(products)) {
            return NextResponse.json({ error: "Products array is required" }, { status: 400 });
        }

        // Potential cleanup of previous staging data if needed
        // await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        for (const p of products) {
            const staging = await prisma.stagingProduct.create({
                data: {
                    catalogId,
                    sku: p.sku,
                    ean: p.ean || null,
                    parentSku: p.parentSku || null,
                    brand: p.brand || null,
                    category: p.category || null,
                }
            });

            // Texts
            await prisma.stagingProductText.create({
                data: {
                    stagingProductId: staging.id,
                    language: "it",
                    title: p.title || null,
                    description: p.description || null,
                    bulletPoints: p.bulletPoints || null,
                }
            });

            // Price
            if (p.price) {
                const parsedPrice = parseFloat(p.price.toString().replace(",", "."));
                if (!isNaN(parsedPrice)) {
                    await prisma.stagingProductPrice.create({
                        data: {
                            stagingProductId: staging.id,
                            price: parsedPrice
                        }
                    });
                }
            }

            // Images (if any from CSV)
            if (p.images && Array.isArray(p.images)) {
                await prisma.stagingProductImage.createMany({
                    data: p.images.map((img: string) => ({
                        stagingProductId: staging.id,
                        imageUrl: img
                    }))
                });
            }
        }

        return NextResponse.json({ success: true, count: products.length });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

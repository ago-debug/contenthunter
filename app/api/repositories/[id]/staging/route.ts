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
        const { products } = body;

        if (!Array.isArray(products)) {
            return NextResponse.json({ error: "Products array is required" }, { status: 400 });
        }

        // Cleanup previous staging data for this repository
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        for (const p of products) {
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

            // Texts
            await prisma.stagingProductText.create({
                data: {
                    stagingProductId: staging.id,
                    language: "it",
                    title: p.title ? String(p.title) : null,
                    description: p.description ? String(p.description) : null,
                    bulletPoints: p.bulletPoints ? String(p.bulletPoints) : null,
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
        }

        return NextResponse.json({ success: true, count: products.length });
    } catch (err: any) {
        console.error("Staging POST error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

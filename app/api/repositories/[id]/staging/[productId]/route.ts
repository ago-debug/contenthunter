import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string, productId: string }> }
) {
    try {
        const { productId } = await params;
        const body = await req.json();
        const id = parseInt(productId);

        const updated = await prisma.stagingProduct.update({
            where: { id },
            data: {
                sku: body.sku,
                ean: body.ean,
                parentSku: body.parentSku,
                brand: body.brand,
                category: body.category,
                texts: {
                    upsert: {
                        where: { stagingProductId_language: { stagingProductId: id, language: "it" } },
                        update: {
                            title: body.texts[0]?.title,
                            description: body.texts[0]?.description,
                            bulletPoints: body.texts[0]?.bulletPoints,
                        },
                        create: {
                            language: "it",
                            title: body.texts[0]?.title,
                            description: body.texts[0]?.description,
                            bulletPoints: body.texts[0]?.bulletPoints,
                        }
                    }
                },
                prices: {
                    upsert: {
                        where: { stagingProductId_listName: { stagingProductId: id, listName: "default" } },
                        update: { price: parseFloat(String(body.prices[0]?.price || "0").replace(/[^0-9.]/g, '')) },
                        create: { listName: "default", price: parseFloat(String(body.prices[0]?.price || "0").replace(/[^0-9.]/g, '')) }
                    }
                }
            }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        console.error("PUT staging error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

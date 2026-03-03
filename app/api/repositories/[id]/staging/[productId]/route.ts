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
                    update: {
                        where: { stagingProductId_language: { stagingProductId: id, language: "it" } },
                        data: {
                            title: body.texts[0]?.title,
                            description: body.texts[0]?.description,
                            bulletPoints: body.texts[0]?.bulletPoints,
                        }
                    }
                },
                prices: {
                    upsert: {
                        where: { stagingProductId_listName: { stagingProductId: id, listName: "default" } },
                        update: { price: parseFloat(body.prices[0]?.price || "0") },
                        create: { listName: "default", price: parseFloat(body.prices[0]?.price || "0") }
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

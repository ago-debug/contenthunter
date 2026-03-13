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

        const listName = body.listName || "default";
        const priceVal = parseFloat(String(body.prices?.[0]?.price ?? "0").replace(/[^0-9,.]/g, "").replace(",", ".")) || 0;

        const updated = await prisma.stagingProduct.update({
            where: { id },
            data: {
                sku: body.sku ?? undefined,
                ean: body.ean ?? undefined,
                parentSku: body.parentSku ?? undefined,
                brand: body.brand ?? undefined,
                category: body.category ?? undefined,
                texts: {
                    upsert: {
                        where: { stagingProductId_language: { stagingProductId: id, language: "it" } },
                        update: {
                            title: body.texts?.[0]?.title,
                            description: body.texts?.[0]?.description,
                            docDescription: body.texts?.[0]?.docDescription,
                            bulletPoints: body.texts?.[0]?.bulletPoints,
                            seoAiText: body.texts?.[0]?.seoAiText,
                        },
                        create: {
                            language: "it",
                            title: body.texts?.[0]?.title,
                            description: body.texts?.[0]?.description,
                            docDescription: body.texts?.[0]?.docDescription,
                            bulletPoints: body.texts?.[0]?.bulletPoints,
                            seoAiText: body.texts?.[0]?.seoAiText,
                        }
                    }
                },
                prices: {
                    upsert: {
                        where: { stagingProductId_listName: { stagingProductId: id, listName } },
                        update: { price: priceVal },
                        create: { listName, price: priceVal }
                    }
                }
            }
        });

        const extraKeys = ["dimensions", "weight", "material", "stockLocal", "stockSupplier"];
        const extraFromBody = body.extraFields && Array.isArray(body.extraFields)
            ? body.extraFields
            : (body.extraFields && typeof body.extraFields === "object"
                ? Object.entries(body.extraFields).map(([key, value]) => ({ key, value: String(value ?? "") }))
                : []);

        const extraMap = new Map<string, string>();
        extraFromBody.forEach((ex: { key: string; value: string }) => {
            if (ex.key) extraMap.set(ex.key, String(ex.value ?? ""));
        });
        for (const key of extraKeys) {
            const value = extraMap.get(key) ?? body[key];
            if (value === undefined) continue;
            await prisma.stagingProductExtra.upsert({
                where: {
                    stagingProductId_key: { stagingProductId: id, key }
                },
                update: { value: String(value) },
                create: { stagingProductId: id, key, value: String(value) }
            });
        }

        const withRelations = await prisma.stagingProduct.findUnique({
            where: { id },
            include: {
                texts: { where: { language: "it" } },
                prices: true,
                extraFields: true,
                images: true
            }
        });

        return NextResponse.json(withRelations ?? updated);
    } catch (err: any) {
        console.error("PUT staging error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

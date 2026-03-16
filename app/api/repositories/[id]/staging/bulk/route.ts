import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BulkField = "brand" | "category" | "stockLocal" | "stockSupplier";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }

        const body = await req.json();
        const { field, value, onlyEmpty = true } = body as {
            field?: BulkField;
            value?: string;
            onlyEmpty?: boolean;
        };

        if (!field || !["brand", "category", "stockLocal", "stockSupplier"].includes(field)) {
            return NextResponse.json({ error: "Campo non supportato per l'aggiornamento massivo." }, { status: 400 });
        }

        if (typeof value !== "string" || value.trim().length === 0) {
            return NextResponse.json({ error: "Valore non valido." }, { status: 400 });
        }

        const cleanValue = value.trim();

        // Campi diretti sullo stagingProduct (brand / category)
        if (field === "brand" || field === "category") {
            const where: any = { catalogId };
            if (onlyEmpty) {
                where.OR = [
                    { [field]: null },
                    { [field]: "" }
                ];
            }

            const result = await prisma.stagingProduct.updateMany({
                where,
                data: {
                    [field]: cleanValue
                }
            });

            return NextResponse.json({
                success: true,
                updatedCount: result.count
            });
        }

        // Campi extra (magazzino interno / fornitore) salvati in StagingProductExtra
        const targetKey = field === "stockLocal" ? "stockLocal" : "stockSupplier";

        const products = await prisma.stagingProduct.findMany({
            where: { catalogId },
            select: { id: true }
        });

        let updatedCount = 0;

        for (const prod of products) {
            const existing = await prisma.stagingProductExtra.findUnique({
                where: {
                    stagingProductId_key: {
                        stagingProductId: prod.id,
                        key: targetKey
                    }
                }
            });

            if (onlyEmpty && existing && existing.value && existing.value.trim().length > 0) {
                continue;
            }

            if (!existing) {
                await prisma.stagingProductExtra.create({
                    data: {
                        stagingProductId: prod.id,
                        key: targetKey,
                        value: cleanValue
                    }
                });
                updatedCount++;
            } else {
                await prisma.stagingProductExtra.update({
                    where: {
                        stagingProductId_key: {
                            stagingProductId: prod.id,
                            key: targetKey
                        }
                    },
                    data: {
                        value: cleanValue
                    }
                });
                updatedCount++;
            }
        }

        return NextResponse.json({
            success: true,
            updatedCount
        });
    } catch (err: any) {
        console.error("Staging bulk update error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}


import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BulkField = "brand" | "category";

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

        if (!field || !["brand", "category"].includes(field)) {
            return NextResponse.json({ error: "Campo non supportato per l'aggiornamento massivo." }, { status: 400 });
        }

        if (typeof value !== "string" || value.trim().length === 0) {
            return NextResponse.json({ error: "Valore non valido." }, { status: 400 });
        }

        const cleanValue = value.trim();

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
    } catch (err: any) {
        console.error("Staging bulk update error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}


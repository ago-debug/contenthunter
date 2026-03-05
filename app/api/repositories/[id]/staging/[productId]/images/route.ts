import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; productId: string }> }
) {
    try {
        const { id, productId } = await params;
        const catalogId = parseInt(id);
        const stagingProductId = parseInt(productId);

        if (isNaN(catalogId) || isNaN(stagingProductId)) {
            return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
        }

        const body = await req.json();
        const imageUrl = (body?.imageUrl || "").toString().trim();

        if (!imageUrl) {
            return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
        }

        // Ensure product belongs to catalog
        const prod = await prisma.stagingProduct.findFirst({
            where: { id: stagingProductId, catalogId }
        });
        if (!prod) {
            return NextResponse.json({ error: "Staging product not found for this catalog" }, { status: 404 });
        }

        const existing = await prisma.stagingProductImage.findFirst({
            where: { stagingProductId, imageUrl }
        });
        if (existing) {
            return NextResponse.json({ success: true, image: existing, duplicated: true });
        }

        const created = await prisma.stagingProductImage.create({
            data: {
                stagingProductId,
                imageUrl
            }
        });

        return NextResponse.json({ success: true, image: created });
    } catch (err: any) {
        console.error("Attach staging image error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; productId: string }> }
) {
    try {
        const { id, productId } = await params;
        const catalogId = parseInt(id);
        const stagingProductId = parseInt(productId);

        if (isNaN(catalogId) || isNaN(stagingProductId)) {
            return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
        }

        const body = await req.json();
        const imageUrl = (body?.imageUrl || "").toString().trim();

        if (!imageUrl) {
            return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
        }

        // ensure product belongs to catalog
        const prod = await prisma.stagingProduct.findFirst({
            where: { id: stagingProductId, catalogId }
        });
        if (!prod) {
            return NextResponse.json({ error: "Staging product not found for this catalog" }, { status: 404 });
        }

        const deleted = await prisma.stagingProductImage.deleteMany({
            where: { stagingProductId, imageUrl }
        });

        return NextResponse.json({ success: true, deletedCount: deleted.count });
    } catch (err: any) {
        console.error("Detach staging image error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}


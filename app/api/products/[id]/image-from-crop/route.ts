import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";

function slugForBrand(name: string): string {
    return (name || "products")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "");
}

/**
 * POST /api/products/[id]/image-from-crop
 * Salva un'immagine croppata da catalogo come immagine prodotto in cartella "nomeBrand/images".
 * Body: { dataUrl: string, brandName?: string }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }
        const { id } = await params;
        const productId = parseInt(id);
        if (Number.isNaN(productId)) {
            return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
        }

        const product = await prisma.product.findFirst({
            where: { id: productId, companyId: ctx.companyId },
            select: { id: true, sku: true, brand: true },
        });
        if (!product) {
            return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
        }

        const body = await req.json();
        const dataUrl = body.dataUrl;
        const brandName = body.brandName ?? product.brand ?? "";

        if (!dataUrl || !dataUrl.startsWith("data:image/")) {
            return NextResponse.json({ error: "dataUrl immagine richiesta" }, { status: 400 });
        }

        const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match || match.length !== 3) {
            return NextResponse.json({ error: "Base64 non valido" }, { status: 400 });
        }
        const ext = (match[1] || "jpg").replace("jpeg", "jpg");
        const buffer = Buffer.from(match[2], "base64");

        const brandSlug = slugForBrand(brandName);
        const segment = brandSlug ? `${brandSlug}/images` : "products";
        const uploadDir = path.join(process.cwd(), "public", "uploads", segment);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `${(product.sku || "product").replace(/[^a-z0-9]/gi, "_")}_${crypto.randomUUID().substring(0, 8)}.${ext}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);

        const localUrl = `/uploads/${segment}/${filename}`;

        const newImage = await prisma.productImage.create({
            data: {
                productId: product.id,
                imageUrl: localUrl,
            },
        });

        return NextResponse.json({
            success: true,
            imageUrl: localUrl,
            id: newImage.id,
        });
    } catch (err: any) {
        console.error("Image from crop error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

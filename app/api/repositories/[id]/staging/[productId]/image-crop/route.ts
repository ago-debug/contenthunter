import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string, productId: string }> }
) {
    try {
        const { id, productId } = await params;
        const catalogId = parseInt(id);
        const parsedStagingId = parseInt(productId);

        const { dataUrl, page, bbox, sku } = await req.json();

        if (!dataUrl || !sku) {
            return NextResponse.json({ error: "Missing dataUrl or SKU" }, { status: 400 });
        }

        // 1. Prepare Storage Path
        const uploadDir = path.join(process.cwd(), "public", "uploads", "products", id);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // 2. Determine File Name (SKU based naming style: sku_1, sku_2...)
        const existingImages = await prisma.stagingProductImage.count({
            where: { stagingProductId: parsedStagingId }
        });

        const fileName = `${sku.replace(/[^a-z0-9]/gi, '_')}_${existingImages + 1}.jpg`;
        const filePath = path.join(uploadDir, fileName);
        const publicPath = `/uploads/products/${id}/${fileName}`;

        // 3. Save Image Buffer
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(filePath, buffer);

        // 4. Create DB Entry
        const newImage = await prisma.stagingProductImage.create({
            data: {
                stagingProductId: parsedStagingId,
                imageUrl: publicPath
            }
        });

        // 5. Optionally also store the crop metadata for future reference
        await prisma.stagingProductExtra.create({
            data: {
                stagingProductId: parsedStagingId,
                key: `_crop_meta_${newImage.id}`,
                value: JSON.stringify({ page, bbox })
            }
        });

        return NextResponse.json({
            success: true,
            imageUrl: publicPath,
            id: newImage.id
        });

    } catch (err: any) {
        console.error("Image Crop API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

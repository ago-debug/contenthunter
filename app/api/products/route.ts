import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            sku, name, description, price, category, brand,
            dimensions, weight, material, bulletPoints, images, catalogId
        } = body;

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        // Upsert product based on SKU
        const product = await prisma.product.upsert({
            where: { sku: sku.toString() },
            update: {
                name,
                description,
                price,
                category,
                brand,
                dimensions,
                weight,
                material,
                bulletPoints,
                catalogId: catalogId || 1, // Fallback to first if not provided
            },
            create: {
                sku: sku.toString(),
                name,
                description,
                price,
                category,
                brand,
                dimensions,
                weight,
                material,
                bulletPoints,
                catalogId: catalogId || 1,
            },
        });

        // Handle images: delete old ones and add new ones (or sync them)
        // For simplicity, we'll just add new ones or clear and re-add if multiple are allowed
        if (images && Array.isArray(images)) {
            // Clear existing images for this product
            await prisma.productImage.deleteMany({
                where: { productId: product.id }
            });

            // Add new images
            await prisma.productImage.createMany({
                data: images.map((img: any) => ({
                    productId: product.id,
                    imageUrl: img.url // This will be the dataURI or local path
                }))
            });
        }

        return NextResponse.json({ success: true, productId: product.id });
    } catch (err: any) {
        console.error("Product save error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            select: {
                id: true,
                sku: true,
                name: true,
                price: true,
                category: true,
                updatedAt: true,
                images: {
                    select: {
                        imageUrl: true
                    },
                    take: 1 // Only need one preview image for the list
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(products);
    } catch (err: any) {
        console.error("Fetch products error details:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sku = searchParams.get("sku");

        if (!sku) {
            return NextResponse.json({ error: "SKU is required" }, { status: 400 });
        }

        await prisma.product.delete({
            where: { sku: sku }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete product error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

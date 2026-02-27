import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            select: {
                sku: true,
                title: true,
                docDescription: true,
                category: true,
                price: true,
                brand: true,
                dimensions: true,
                weight: true,
                material: true,
                bulletPoints: true,
                description: true,
                images: {
                    select: {
                        imageUrl: true
                    }
                }
            }
        });

        const data = products.map((p: any) => ({
            SKU: p.sku,
            Title: p.title || "",
            DocDescription: p.docDescription || "",
            Category: p.category || "",
            Price: p.price || "",
            Brand: p.brand || "",
            Dimensions: p.dimensions || "",
            Weight: p.weight || "",
            Material: p.material || "",
            BulletPoints: p.bulletPoints || "",
            Description: p.description || "",
            ImageLinks: p.images.map((img: any) => img.imageUrl.substring(0, 100) + '...').join('; ') // Truncate URLs in Excel for readability or use links
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="price-list-${Date.now()}.xlsx"`,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        });
    } catch (err: any) {
        console.error("Export error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

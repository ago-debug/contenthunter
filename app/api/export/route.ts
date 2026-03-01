import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { imageUrl: true } }
            }
        });

        const data = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};

            let dimensions = "";
            let weight = "";
            let material = "";

            p.extraFields.forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                if (ex.key === "weight") weight = ex.value;
                if (ex.key === "material") material = ex.value;
            });

            return {
                SKU: p.sku,
                EAN: p.ean || "",
                ParentSKU: p.parentSku || "",
                Title: itText.title || "",
                DocDescription: itText.docDescription || "",
                Category: p.category || "",
                Price: defPrice.price !== undefined ? String(defPrice.price) : "",
                Brand: p.brand || "",
                Dimensions: dimensions,
                Weight: weight,
                Material: material,
                BulletPoints: itText.bulletPoints || "",
                Description: itText.description || "",
                ImageLinks: p.images.map((img: any) => img.imageUrl.substring(0, 100)).join('; ')
            };
        });

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

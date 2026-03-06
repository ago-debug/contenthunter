import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const EXPORT_FIELDS: { key: string; label: string }[] = [
    { key: "sku", label: "SKU" },
    { key: "ean", label: "EAN" },
    { key: "parentSku", label: "Parent SKU" },
    { key: "title", label: "Titolo" },
    { key: "docDescription", label: "Descrizione documento" },
    { key: "category", label: "Categoria" },
    { key: "price", label: "Prezzo" },
    { key: "brand", label: "Brand" },
    { key: "dimensions", label: "Dimensioni" },
    { key: "weight", label: "Peso" },
    { key: "material", label: "Materiale" },
    { key: "bulletPoints", label: "Punti elenco" },
    { key: "description", label: "Descrizione" },
    { key: "images", label: "Immagini" },
];

function buildWhere(filters: {
    search?: string;
    brandId?: number;
    categoryId?: number;
    subCategoryId?: number;
    subSubCategoryId?: number;
}) {
    const where: any = {};
    if (filters.brandId) where.brandId = filters.brandId;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.subCategoryId) where.subCategoryId = filters.subCategoryId;
    if (filters.subSubCategoryId) where.subSubCategoryId = filters.subSubCategoryId;
    if (filters.search && filters.search.trim()) {
        const term = filters.search.trim().toLowerCase();
        where.OR = [
            { sku: { contains: term, mode: "insensitive" } },
            { brand: { contains: term, mode: "insensitive" } },
            { category: { contains: term, mode: "insensitive" } },
            { texts: { some: { language: "it", title: { contains: term, mode: "insensitive" } } } },
            { texts: { some: { language: "it", description: { contains: term, mode: "insensitive" } } } },
        ];
    }
    return Object.keys(where).length === 0 ? undefined : where;
}

export async function GET() {
    try {
        const products = await prisma.product.findMany({
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { imageUrl: true } },
            },
        });

        const data = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};
            let dimensions = "",
                weight = "",
                material = "";
            p.extraFields.forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                if (ex.key === "weight") weight = ex.value;
                if (ex.key === "material") material = ex.value;
            });
            const imageLinks = p.images.map((img: any) => img.imageUrl).filter(Boolean);
            return {
                SKU: p.sku,
                EAN: p.ean || "",
                "Parent SKU": p.parentSku || "",
                Titolo: itText.title || "",
                "Descrizione documento": itText.docDescription || "",
                Categoria: p.category || "",
                Prezzo: defPrice.price !== undefined ? String(defPrice.price) : "",
                Brand: p.brand || "",
                Dimensioni: dimensions,
                Peso: weight,
                Materiale: material,
                "Punti elenco": itText.bulletPoints || "",
                Descrizione: itText.description || "",
                Immagini: imageLinks.join("\n"),
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="price-list-${Date.now()}.xlsx"`,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        });
    } catch (err: any) {
        console.error("Export GET error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const {
            fields = ["sku", "title", "price", "brand", "category", "images"],
            filters = {},
        } = body as {
            fields?: string[];
            filters?: {
                search?: string;
                brandId?: number;
                categoryId?: number;
                subCategoryId?: number;
                subSubCategoryId?: number;
            };
        };

        const where = buildWhere(filters);

        const products = await prisma.product.findMany({
            where,
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { imageUrl: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        const colOrder = EXPORT_FIELDS.filter((f) => fields.includes(f.key));
        const data = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};
            let dimensions = "",
                weight = "",
                material = "";
            p.extraFields.forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                if (ex.key === "weight") weight = ex.value;
                if (ex.key === "material") material = ex.value;
            });
            const imageLinks = (p.images || []).map((img: any) => img.imageUrl).filter(Boolean);
            const row: Record<string, string> = {};
            colOrder.forEach(({ key, label }) => {
                switch (key) {
                    case "sku":
                        row[label] = p.sku || "";
                        break;
                    case "ean":
                        row[label] = p.ean || "";
                        break;
                    case "parentSku":
                        row[label] = p.parentSku || "";
                        break;
                    case "title":
                        row[label] = itText.title || "";
                        break;
                    case "docDescription":
                        row[label] = itText.docDescription || "";
                        break;
                    case "category":
                        row[label] = p.category || "";
                        break;
                    case "price":
                        row[label] = defPrice.price !== undefined ? String(defPrice.price) : "";
                        break;
                    case "brand":
                        row[label] = p.brand || "";
                        break;
                    case "dimensions":
                        row[label] = dimensions;
                        break;
                    case "weight":
                        row[label] = weight;
                        break;
                    case "material":
                        row[label] = material;
                        break;
                    case "bulletPoints":
                        row[label] = itText.bulletPoints || "";
                        break;
                    case "description":
                        row[label] = itText.description || "";
                        break;
                    case "images":
                        row[label] = imageLinks.join("\n");
                        break;
                    default:
                        row[label] = "";
                }
            });
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="export-${Date.now()}.xlsx"`,
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
        });
    } catch (err: any) {
        console.error("Export POST error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

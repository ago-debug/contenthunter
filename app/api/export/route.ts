import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import * as XLSX from "xlsx";

// Tutti i campi presenti nella scheda prodotto (Master ERP)
const EXPORT_FIELDS: { key: string; label: string }[] = [
    { key: "sku", label: "SKU" },
    { key: "ean", label: "EAN" },
    { key: "parentSku", label: "Parent SKU" },
    { key: "title", label: "Titolo prodotto" },
    { key: "brand", label: "Brand" },
    { key: "tags", label: "Tag" },
    { key: "categoryName", label: "Categoria (livello 1)" },
    { key: "subCategoryName", label: "Sub-categoria (livello 2)" },
    { key: "subSubCategoryName", label: "Livello 3" },
    { key: "price", label: "Prezzo listino (€)" },
    { key: "weight", label: "Peso (kg)" },
    { key: "status", label: "Status ERP" },
    { key: "stock", label: "Quantità stock" },
    { key: "images", label: "Immagini (link)" },
    { key: "seoAiText", label: "Copywriting breve / SEO" },
    { key: "description", label: "Descrizione lunga" },
    { key: "docDescription", label: "Sorgente dati tecnici" },
    { key: "bulletPoints", label: "Punti elenco" },
    { key: "material", label: "Materiale" },
    { key: "dimensions", label: "Dimensioni / Calibro" },
    { key: "extraFields", label: "Altri attributi" },
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

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const products = await prisma.product.findMany({
            where: { companyId: ctx.companyId },
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { imageUrl: true } },
                tags: { include: { tag: true } },
                categoryRef: true,
                subCategoryRef: true,
                subSubCategoryRef: true,
            },
        });

        const data = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};
            const extra: Record<string, string> = {};
            let dimensions = "", weight = "", material = "", status = "", stock = "";
            (p.extraFields || []).forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else if (ex.key === "status") status = ex.value;
                else if (ex.key === "stock") stock = ex.value;
                else extra[ex.key] = ex.value;
            });
            const extraFieldsStr = Object.entries(extra).map(([k, v]) => `${k}: ${v}`).join("\n");
            const imageLinks = (p.images || []).map((img: any) => img.imageUrl).filter(Boolean);
            const tagNames = (p.tags || []).map((pt: any) => pt.tag?.name).filter(Boolean).join(", ");
            return {
                SKU: p.sku,
                EAN: p.ean || "",
                "Parent SKU": p.parentSku || "",
                "Titolo prodotto": itText.title || "",
                Brand: p.brand || "",
                Tag: tagNames,
                "Categoria (livello 1)": p.categoryRef?.name || p.category || "",
                "Sub-categoria (livello 2)": p.subCategoryRef?.name || "",
                "Livello 3": p.subSubCategoryRef?.name || "",
                "Prezzo listino (€)": defPrice.price !== undefined ? String(defPrice.price) : "",
                "Peso (kg)": weight,
                "Status ERP": status,
                "Quantità stock": stock,
                "Immagini (link)": imageLinks.join("\n"),
                "Copywriting breve / SEO": itText.seoAiText || "",
                "Descrizione lunga": itText.description || "",
                "Sorgente dati tecnici": itText.docDescription || "",
                "Punti elenco": itText.bulletPoints || "",
                Materiale: material,
                "Dimensioni / Calibro": dimensions,
                "Altri attributi": extraFieldsStr,
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
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
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

        const filterWhere = buildWhere(filters);
        const where = { companyId: ctx.companyId, ...filterWhere };

        const products = await prisma.product.findMany({
            where,
            include: {
                texts: { where: { language: "it" } },
                prices: { where: { listName: "default" } },
                extraFields: true,
                images: { select: { imageUrl: true } },
                tags: { include: { tag: true } },
                categoryRef: true,
                subCategoryRef: true,
                subSubCategoryRef: true,
            },
            orderBy: { createdAt: "desc" },
        });

        const colOrder = EXPORT_FIELDS.filter((f) => fields.includes(f.key));
        const data = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};
            const extra: Record<string, string> = {};
            let dimensions = "",
                weight = "",
                material = "",
                status = "",
                stock = "";
            (p.extraFields || []).forEach((ex: any) => {
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else if (ex.key === "status") status = ex.value;
                else if (ex.key === "stock") stock = ex.value;
                else extra[ex.key] = ex.value;
            });
            const extraFieldsStr = Object.entries(extra)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n");
            const imageLinks = (p.images || []).map((img: any) => img.imageUrl).filter(Boolean);
            const tagNames = (p.tags || [])
                .map((pt: any) => pt.tag?.name)
                .filter(Boolean)
                .join(", ");
            const categoryName = p.categoryRef?.name || p.category || "";
            const subCategoryName = p.subCategoryRef?.name || "";
            const subSubCategoryName = p.subSubCategoryRef?.name || "";

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
                    case "categoryName":
                        row[label] = categoryName;
                        break;
                    case "subCategoryName":
                        row[label] = subCategoryName;
                        break;
                    case "subSubCategoryName":
                        row[label] = subSubCategoryName;
                        break;
                    case "price":
                        row[label] = defPrice.price !== undefined ? String(defPrice.price) : "";
                        break;
                    case "brand":
                        row[label] = p.brand || "";
                        break;
                    case "tags":
                        row[label] = tagNames;
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
                    case "status":
                        row[label] = status;
                        break;
                    case "stock":
                        row[label] = stock;
                        break;
                    case "bulletPoints":
                        row[label] = itText.bulletPoints || "";
                        break;
                    case "description":
                        row[label] = itText.description || "";
                        break;
                    case "seoAiText":
                        row[label] = itText.seoAiText || "";
                        break;
                    case "images":
                        row[label] = imageLinks.join("\n");
                        break;
                    case "extraFields":
                        row[label] = extraFieldsStr;
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import * as XLSX from "xlsx";
import { normalizeStockExtraKey } from "@/lib/stock-extra";

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
    { key: "stockLocal", label: "Magazzino locale (Q.tà)" },
    { key: "stockSupplier", label: "Magazzino fornitore (Q.tà)" },
    { key: "image1", label: "Immagine 1 (link)" },
    { key: "image2", label: "Immagine 2 (link)" },
    { key: "image3", label: "Immagine 3 (link)" },
    { key: "image4", label: "Immagine 4 (link)" },
    { key: "image5", label: "Immagine 5 (link)" },
    { key: "seoAiText", label: "Descrizione breve e-commerce (HTML)" },
    { key: "description", label: "Descrizione lunga" },
    { key: "bulletPoints", label: "Punti elenco" },
    { key: "material", label: "Materiale" },
    { key: "dimensions", label: "Dimensioni / Calibro" },
];

const CSV_MIME = "text/csv; charset=utf-8";
const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function csvEscape(value: any): string {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json(
            { error: "Non autorizzato o azienda non specificata" },
            { status: 403 }
        );
    }

    try {
        const body = await req.json().catch(() => ({}));
        const { ids, format } = body as {
            ids?: number[];
            format?: "excel" | "csv" | string;
        };

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "Nessun id selezionato" }, { status: 400 });
        }

        const effectiveFormat = (format || "excel").toString().toLowerCase();
        const outFormat = effectiveFormat === "csv" ? "csv" : "excel";

        const products = await prisma.product.findMany({
            where: {
                companyId: ctx.companyId,
                id: { in: ids },
            },
            select: {
                sku: true,
                ean: true,
                parentSku: true,
                brand: true,
                category: true,
                createdAt: true,
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

        const legacyExtraKeys = new Set([
            "dimensions",
            "weight",
            "material",
            "status",
            "stockLocal",
            "stockSupplier",
        ]);

        const allExtraKeys = new Set<string>();
        products.forEach((p: any) => {
            (p.extraFields || []).forEach((ex: any) => {
                if (!ex?.key) return;
                if (!legacyExtraKeys.has(ex.key)) allExtraKeys.add(ex.key);
            });
        });

        const sortedExtraKeys = Array.from(allExtraKeys).sort((a, b) => a.localeCompare(b));

        const rows = products.map((p: any) => {
            const itText = p.texts?.[0] || {};
            const defPrice = p.prices?.[0] || {};

            let dimensions = "",
                weight = "",
                material = "",
                status = "",
                stockLocal = "",
                stockSupplier = "";

            const otherExtras: Record<string, string> = {};
            (p.extraFields || []).forEach((ex: any) => {
                if (!ex?.key) return;
                const stockAlias = normalizeStockExtraKey(ex.key);
                if (ex.key === "dimensions") dimensions = ex.value;
                else if (ex.key === "weight") weight = ex.value;
                else if (ex.key === "material") material = ex.value;
                else if (ex.key === "status") status = ex.value;
                else if (stockAlias === "stockLocal") stockLocal = ex.value;
                else if (stockAlias === "stockSupplier") stockSupplier = ex.value;
                else otherExtras[ex.key] = ex.value;
            });

            const imageLinks = (p.images || [])
                .map((img: any) => img.imageUrl)
                .filter(Boolean);

            const tagNames = (p.tags || [])
                .map((pt: any) => pt.tag?.name)
                .filter(Boolean)
                .join(", ");

            const categoryName = p.categoryRef?.name || p.category || "";
            const subCategoryName = p.subCategoryRef?.name || "";
            const subSubCategoryName = p.subSubCategoryRef?.name || "";

            const row: Record<string, string> = {};
            for (const { key, label } of EXPORT_FIELDS) {
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
                    case "brand":
                        row[label] = p.brand || "";
                        break;
                    case "tags":
                        row[label] = tagNames;
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
                        row[label] =
                            defPrice.price !== undefined ? String(defPrice.price) : "";
                        break;
                    case "weight":
                        row[label] = weight;
                        break;
                    case "status":
                        row[label] = status;
                        break;
                    case "stockLocal":
                        row[label] = stockLocal;
                        break;
                    case "stockSupplier":
                        row[label] = stockSupplier;
                        break;
                    case "image1":
                        row[label] = imageLinks[0] || "";
                        break;
                    case "image2":
                        row[label] = imageLinks[1] || "";
                        break;
                    case "image3":
                        row[label] = imageLinks[2] || "";
                        break;
                    case "image4":
                        row[label] = imageLinks[3] || "";
                        break;
                    case "image5":
                        row[label] = imageLinks[4] || "";
                        break;
                    case "seoAiText":
                        row[label] = itText.seoAiText || "";
                        break;
                    case "description":
                        row[label] = itText.description || "";
                        break;
                    case "bulletPoints":
                        row[label] = itText.bulletPoints || "";
                        break;
                    case "material":
                        row[label] = material;
                        break;
                    case "dimensions":
                        row[label] = dimensions;
                        break;
                    default:
                        row[label] = "";
                }
            }

            // Extra dinamici: una colonna per key
            for (const k of sortedExtraKeys) {
                row[k] = otherExtras[k] || "";
            }

            return row;
        });

        const columns = [
            ...EXPORT_FIELDS.map((f) => f.label),
            ...sortedExtraKeys,
        ];

        const timestamp = Date.now();
        const fileName =
            outFormat === "csv"
                ? `products-selected-${timestamp}.csv`
                : `products-selected-${timestamp}.xlsx`;

        if (outFormat === "csv") {
            const headerLine = columns.map((c) => csvEscape(c)).join(",");
            const bodyLines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
            const csv = [headerLine, ...bodyLines].join("\n");

            return new Response(csv, {
                status: 200,
                headers: {
                    "Content-Disposition": `attachment; filename="${fileName}"`,
                    "Content-Type": CSV_MIME,
                },
            });
        }

        const worksheet = XLSX.utils.json_to_sheet(
            rows.map((r) => {
                const obj: Record<string, string> = {};
                columns.forEach((c) => {
                    obj[c] = r[c] ?? "";
                });
                return obj;
            })
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Selected");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Content-Type": XLSX_MIME,
            },
        });
    } catch (err: any) {
        console.error("Export selected error:", err);
        return NextResponse.json({ error: err?.message || "Export failed" }, { status: 500 });
    }
}


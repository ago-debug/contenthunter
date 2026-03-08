import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractProductsFromPdf } from "@/lib/gemini-pdf";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { getPdfBuffer } from "@/lib/pdf-service";

export const maxDuration = 300;
export const config = {
    api: { bodyParser: { sizeLimit: "100mb" } },
};

/**
 * PDF extraction via Gemini (NotebookLM-style). Uses pdf-service for file access.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    const startTime = Date.now();
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const parsedPdfId = parseInt(pdfId, 10);

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }

        const pdfBuffer = await getPdfBuffer(catalogId, parsedPdfId);
        if (!pdfBuffer) {
            return NextResponse.json({ error: "PDF non trovato o file non leggibile." }, { status: 404 });
        }

        const pdfBase64 = pdfBuffer.toString("base64");

        const { products: extractedProducts } = await extractProductsFromPdf(pdfBase64);
        console.log("[Gemini PDF] Extracted", extractedProducts.length, "products.");

        await prisma.stagingProduct.deleteMany({ where: { catalogId } });
        let importedCount = 0;

        for (const p of extractedProducts) {
            if (!p.sku) continue;
            try {
                const staging = await prisma.stagingProduct.create({
                    data: {
                        catalogId,
                        sku: String(p.sku).trim(),
                        ean: p.ean ? String(p.ean).trim() : null,
                        brand: p.brand ? String(p.brand).trim() : null,
                        category: p.category ? String(p.category).trim() : null,
                    },
                });

                await prisma.stagingProductText.create({
                    data: {
                        stagingProductId: staging.id,
                        language: "it",
                        title: p.title || "Prodotto senza titolo",
                        description: p.description || null,
                        bulletPoints: (p as any).bulletPoints || null,
                    },
                });

                if (p.price != null) {
                    const parsedPrice = typeof p.price === "number" ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, ""));
                    if (!isNaN(parsedPrice)) {
                        await prisma.stagingProductPrice.create({
                            data: { stagingProductId: staging.id, price: parsedPrice },
                        });
                    }
                }

                if (p.extraFields && Array.isArray(p.extraFields)) {
                    for (const ef of p.extraFields) {
                        await prisma.stagingProductExtra.create({
                            data: {
                                stagingProductId: staging.id,
                                key: ef.key,
                                value: String(ef.value),
                            },
                        });
                    }
                }

                if (p.image_bbox && p.pageNumber != null) {
                    await prisma.stagingProductExtra.create({
                        data: {
                            stagingProductId: staging.id,
                            key: "_ai_visual_mapping",
                            value: JSON.stringify({
                                page: p.pageNumber,
                                bbox: p.image_bbox,
                                pdfId: parsedPdfId,
                            }),
                        },
                    });
                }

                importedCount++;
            } catch (pErr) {
                console.error("[Gemini PDF] Error importing SKU", p.sku, pErr);
            }
        }

        const pdfMeta = await prisma.catalogPdf.findUnique({
            where: { id: parsedPdfId },
            select: { fileName: true },
        });
        await prisma.catalogPdf.update({
            where: { id: parsedPdfId },
            data: { processed: true },
        });
        await prisma.catalog.update({
            where: { id: catalogId },
            data: { lastListinoName: "Gemini_" + (pdfMeta?.fileName || "catalog") },
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return NextResponse.json({
            success: true,
            count: importedCount,
            duration: duration + "s",
        });
    } catch (err: any) {
        console.error("[Gemini PDF] Extract error:", err);
        const message = err?.message || "Errore sconosciuto";
        const isConfig = message.includes("GEMINI_API_KEY") || message.includes("configured");
        return NextResponse.json(
            {
                error: message,
                hint: isConfig ? "Imposta GEMINI_API_KEY in .env" : "Verifica che il PDF sia valido e che il file esista sul server.",
                stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
            },
            { status: 500 }
        );
    }
}

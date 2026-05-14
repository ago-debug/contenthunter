import { prisma } from "@/lib/prisma";

/** Shape prodotto restituito da Gemini/OpenAI (estrazione catalogo PDF). */
export type ExtractedCatalogProduct = {
    sku?: unknown;
    ean?: unknown;
    title?: unknown;
    description?: unknown;
    bulletPoints?: unknown;
    price?: unknown;
    brand?: unknown;
    category?: unknown;
    extraFields?: Array<{ key: string; value: string }>;
    image_bbox?: unknown;
    pageNumber?: unknown;
};

/** Prisma `StagingProductText.bulletPoints` è `String?`; l'AI può restituire stringa o array. */
function coerceBulletPointsText(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
        return value.map((x) => String(x).trim()).filter(Boolean).join("\n") || null;
    }
    return null;
}

/**
 * Importa prodotti estratti in staging.
 * @param clearStagingFirst se true (default), elimina tutto lo staging del catalogo prima dell’import.
 */
export async function importExtractedProductsToStaging(params: {
    catalogId: number;
    pdfId: number;
    extractedProducts: ExtractedCatalogProduct[];
    clearStagingFirst?: boolean;
}): Promise<{ importedCount: number }> {
    const { catalogId, pdfId: parsedPdfId, extractedProducts, clearStagingFirst = true } = params;

    if (clearStagingFirst) {
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });
    }

    let existingSkus = new Set<string>();
    if (!clearStagingFirst) {
        const rows = await prisma.stagingProduct.findMany({
            where: { catalogId },
            select: { sku: true },
        });
        existingSkus = new Set(rows.map((r) => String(r.sku || "").trim().toUpperCase()).filter(Boolean));
    }

    let importedCount = 0;

    for (const p of extractedProducts) {
        if (!p.sku) continue;
        const skuKey = String(p.sku).trim().toUpperCase();
        if (!clearStagingFirst && skuKey && existingSkus.has(skuKey)) {
            continue;
        }
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
                    title: (p.title as string) || "Prodotto senza titolo",
                    description: (p.description as string) || null,
                    bulletPoints: coerceBulletPointsText(p.bulletPoints),
                },
            });

            if (p.price != null) {
                const parsedPrice =
                    typeof p.price === "number" ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, ""));
                if (!Number.isNaN(parsedPrice)) {
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

            if (p.image_bbox != null && p.pageNumber != null) {
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
            if (skuKey) existingSkus.add(skuKey);
        } catch (pErr) {
            console.error("[staging-import] Error importing SKU", p.sku, pErr);
        }
    }

    return { importedCount };
}

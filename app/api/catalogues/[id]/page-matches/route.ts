import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCatalogAccess } from "@/lib/auth-api";

/**
 * GET /api/catalogues/[id]/page-matches
 * Per ogni pagina PDF restituisce i prodotti del catalogo (SKU/EAN) presenti nel testo della pagina.
 * Usato per mostrare "questa pagina è associabile a prodotto X" e per il crop da catalogo.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (Number.isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }
        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }

        const [pages, entries] = await Promise.all([
            (prisma as any).pdfPage.findMany({
                where: { catalogId },
                orderBy: { pageNumber: "asc" },
                select: { id: true, pageNumber: true, text: true, imageUrl: true, subImages: true },
            }),
            prisma.catalogEntry.findMany({
                where: { catalogId },
                include: {
                    product: {
                        select: { id: true, sku: true, ean: true, brand: true }
                    }
                },
            }),
        ]);

        const productIdentifiers = entries.map((e: any) => ({
            productId: e.product.id,
            sku: (e.product.sku || "").trim(),
            ean: (e.product.ean || "").trim(),
            brand: e.product.brand || "",
        })).filter((p: any) => p.sku || p.ean);

        const pageMatches = pages.map((p: any) => {
            const text = (p.text || "").toLowerCase();
            const matched: { productId: number; sku: string; ean: string; matchType: "sku" | "ean" }[] = [];
            const seen = new Set<number>();

            for (const prod of productIdentifiers) {
                if (seen.has(prod.productId)) continue;
                if (prod.sku && text.includes(prod.sku.toLowerCase())) {
                    matched.push({
                        productId: prod.productId,
                        sku: prod.sku,
                        ean: prod.ean || "",
                        matchType: "sku",
                    });
                    seen.add(prod.productId);
                } else if (prod.ean && text.includes(prod.ean)) {
                    matched.push({
                        productId: prod.productId,
                        sku: prod.sku,
                        ean: prod.ean,
                        matchType: "ean",
                    });
                    seen.add(prod.productId);
                }
            }

            return {
                pageId: p.id,
                pageNumber: p.pageNumber,
                imageUrl: p.imageUrl,
                subImages: typeof p.subImages === "string" ? JSON.parse(p.subImages || "[]") : (p.subImages || []),
                matchedProducts: matched,
            };
        });

        return NextResponse.json(pageMatches);
    } catch (err: any) {
        console.error("Page matches GET error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

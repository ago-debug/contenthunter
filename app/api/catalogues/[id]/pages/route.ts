import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCatalogAccess } from "@/lib/auth-api";

/**
 * GET /api/catalogues/[id]/pages
 * Lista le pagine PDF del catalogo (testi e immagini) per anteprime e associazione prodotti.
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

        const pages = await (prisma as any).pdfPage.findMany({
            where: { catalogId },
            orderBy: { pageNumber: "asc" },
        });

        const formatted = pages.map((p: any) => ({
            id: p.id,
            catalogId: p.catalogId,
            pageNumber: p.pageNumber,
            text: p.text,
            imageUrl: p.imageUrl,
            subImages: typeof p.subImages === "string" ? (JSON.parse(p.subImages || "[]")) : (p.subImages || []),
        }));

        return NextResponse.json(formatted);
    } catch (err: any) {
        console.error("Catalog pages GET error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

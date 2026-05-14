import { NextRequest, NextResponse } from "next/server";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { getPdfBuffer, tryNormalizePdfBuffer } from "@/lib/pdf-service";
import { getPdfPageCount } from "@/lib/pdf-page-range";

export const runtime = "nodejs";

/**
 * GET — numero di pagine del PDF (per batch estrazione lato client).
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const pdfIdNum = parseInt(pdfId, 10);
        if (Number.isNaN(catalogId) || Number.isNaN(pdfIdNum)) {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }

        const access = await ensureCatalogAccess(_req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }

        const pdfBuffer = await getPdfBuffer(catalogId, pdfIdNum);
        if (!pdfBuffer) {
            return NextResponse.json({ error: "PDF non trovato" }, { status: 404 });
        }

        const normalized = await tryNormalizePdfBuffer(pdfBuffer);
        const forCount = normalized ?? pdfBuffer;
        const pageCount = await getPdfPageCount(forCount);

        return NextResponse.json({ pageCount });
    } catch (err: any) {
        console.error("[PDF page-count]", err);
        return NextResponse.json({ error: err?.message || "Errore lettura PDF" }, { status: 500 });
    }
}

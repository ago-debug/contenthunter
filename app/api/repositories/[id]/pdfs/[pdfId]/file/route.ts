import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import fs from "fs";
import { getPdfRecord, validatePdfBufferForServe } from "@/lib/pdf-service";
import { ensureCatalogAccess } from "@/lib/auth-api";

/**
 * GET – Restituisce il file PDF del catalogo (solo se autorizzati).
 * Usare questo endpoint al posto di /api/storage?path= per caricare il PDF nel viewer.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const pdfIdNum = parseInt(pdfId, 10);
        if (isNaN(catalogId) || isNaN(pdfIdNum)) {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }

        const record = await getPdfRecord(catalogId, pdfIdNum);
        if (!record) {
            return NextResponse.json({ error: "PDF non trovato" }, { status: 404 });
        }
        if (!fs.existsSync(record.absolutePath)) {
            return NextResponse.json({ error: "File non trovato sul server" }, { status: 404 });
        }

        const data = await readFile(record.absolutePath);
        const validation = validatePdfBufferForServe(data);
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 422 });
        }

        return new NextResponse(data, {
            headers: {
                "Content-Type": "application/pdf",
                "Cache-Control": "private, max-age=3600",
                "Content-Disposition": "inline; filename=\"" + (record.pdf.fileName || "document.pdf") + "\"",
            },
        });
    } catch (err: any) {
        console.error("[PDF file] Error:", err?.message);
        return NextResponse.json({ error: "Errore nel recupero del PDF" }, { status: 500 });
    }
}

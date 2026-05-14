import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import fs from "fs";
import { buildPdfInlineContentDisposition, getPdfRecord, validatePdfBufferForServe } from "@/lib/pdf-service";
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

        let data: Buffer;
        try {
            data = await readFile(record.absolutePath);
        } catch (readErr: any) {
            const code = readErr?.code;
            console.error("[PDF file] readFile failed:", record.absolutePath, code, readErr?.message);
            if (code === "ENOENT" || code === "ENOTDIR") {
                return NextResponse.json({ error: "File non trovato sul server (path non valido)." }, { status: 404 });
            }
            if (code === "EACCES" || code === "EPERM") {
                return NextResponse.json({ error: "Permesso negato nella lettura del PDF sul server." }, { status: 503 });
            }
            return NextResponse.json({ error: "Impossibile leggere il file PDF dal disco." }, { status: 500 });
        }

        const validation = validatePdfBufferForServe(data);
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 422 });
        }

        // `BodyInit` nei tipi DOM non include `Buffer`/`Uint8Array` generico: `Blob` è sempre valido.
        const body = new Blob([new Uint8Array(data)], { type: "application/pdf" });
        return new NextResponse(body, {
            headers: {
                "Content-Type": "application/pdf",
                "Cache-Control": "private, max-age=3600",
                "Content-Disposition": buildPdfInlineContentDisposition(record.pdf.fileName),
            },
        });
    } catch (err: any) {
        console.error("[PDF file] Error:", err?.stack || err?.message || err);
        return NextResponse.json({ error: "Errore nel recupero del PDF" }, { status: 500 });
    }
}

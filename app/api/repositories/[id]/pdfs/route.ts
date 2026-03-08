import { NextRequest, NextResponse } from "next/server";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { savePdf } from "@/lib/pdf-service";

export const maxDuration = 60;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const catalogId = parseInt(id, 10);
        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalog ID" }, { status: 400 });
        }
        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }

        let name = "upload.pdf";
        if (req.headers.get("X-File-Name")) {
            name = decodeURIComponent(req.headers.get("X-File-Name") || name);
        } else if (req.nextUrl.searchParams.get("name")) {
            name = decodeURIComponent(req.nextUrl.searchParams.get("name") || name);
        }

        const arrayBuffer = await req.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return NextResponse.json({ error: "Nessun file inviato" }, { status: 400 });
        }

        const buffer = Buffer.from(arrayBuffer);
        try {
            const { pdf, sizeBytes, normalized } = await savePdf(catalogId, buffer, name);
            return NextResponse.json({
                ...pdf,
                sizeBytes,
                sizeMB: Math.round((sizeBytes / 1024 / 1024) * 100) / 100,
                validated: true,
                normalized: !!normalized,
            });
        } catch (err: any) {
            const message = err?.message || "Errore salvataggio PDF";
            if (message.includes("troppo grande")) {
                return NextResponse.json({ error: message }, { status: 413 });
            }
            return NextResponse.json({ error: message }, { status: 400 });
        }
    } catch (err: any) {
        console.error("PDF Upload error:", err);
        return NextResponse.json({ error: err.message || "Errore server" }, { status: 500 });
    }
}

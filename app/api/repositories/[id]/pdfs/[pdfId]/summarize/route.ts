import { NextRequest, NextResponse } from "next/server";
import { summarizePdf } from "@/lib/gemini-pdf";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { getPdfBuffer } from "@/lib/pdf-service";

export const maxDuration = 120;

/**
 * NotebookLM-style: summarize the PDF (overview, sections, page count).
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const parsedPdfId = parseInt(pdfId, 10);

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }

        const pdfBuffer = await getPdfBuffer(catalogId, parsedPdfId);
        if (!pdfBuffer) {
            return NextResponse.json({ error: "PDF non trovato o file non leggibile." }, { status: 404 });
        }

        const result = await summarizePdf(pdfBuffer.toString("base64"));
        return NextResponse.json(result);
    } catch (err: any) {
        console.error("[Gemini PDF] Summarize error:", err);
        const message = err?.message || "Errore sconosciuto";
        const isConfig = message.includes("GEMINI_API_KEY");
        return NextResponse.json(
            {
                error: message,
                hint: isConfig ? "Imposta GEMINI_API_KEY in .env" : undefined,
            },
            { status: 500 }
        );
    }
}

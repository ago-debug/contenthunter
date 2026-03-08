import { NextRequest, NextResponse } from "next/server";
import { summarizePdf } from "@/lib/gemini-pdf";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { getPdfBuffer, tryNormalizePdfBuffer, MAX_PDF_SIZE_FOR_GEMINI_BYTES } from "@/lib/pdf-service";

export const maxDuration = 120;

/**
 * NotebookLM-style: summarize the PDF (overview, sections, page count).
 * Uses normalized PDF when possible for better compatibility with Gemini.
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
        if (pdfBuffer.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
            const mb = Math.round(pdfBuffer.length / 1024 / 1024);
            return NextResponse.json(
                {
                    error: `PDF troppo grande per l'analisi (${mb} MB).`,
                    hint: "Per Riassunto/Estrazione usa un file sotto i 18 MB o dividi il catalogo in più PDF.",
                },
                { status: 413 }
            );
        }

        const normalized = await tryNormalizePdfBuffer(pdfBuffer);
        if (normalized === null) {
            return NextResponse.json(
                {
                    error: "Questo PDF ha una struttura non standard e non può essere analizzato.",
                    hint: "Ri-salva il PDF da Acrobat o da un altro programma, oppure carica un file diverso. Il viewer potrebbe mostrare errori di compressione.",
                },
                { status: 400 }
            );
        }
        const result = await summarizePdf(normalized.toString("base64"));
        return NextResponse.json(result);
    } catch (err: any) {
        console.error("[Gemini PDF] Summarize error:", err);
        const message = err?.message || "Errore sconosciuto";
        const isConfig = message.includes("GEMINI_API_KEY");
        const isGemini = message.includes("Gemini") || message.includes("blocked") || message.includes("invalid");
        const status = isGemini ? 502 : 500;
        return NextResponse.json(
            {
                error: message,
                hint: isConfig ? "Imposta GEMINI_API_KEY in .env" : undefined,
            },
            { status }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { askAboutPdf } from "@/lib/gemini-pdf";
import { ensureCatalogAccess } from "@/lib/auth-api";
import { getPdfBuffer, tryNormalizePdfBuffer, MAX_PDF_SIZE_FOR_GEMINI_BYTES } from "@/lib/pdf-service";

export const maxDuration = 120;

/**
 * NotebookLM-style Q&A: ask a question about the PDF content.
 * Body: { "question": "string" }
 */
export async function POST(
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

        const body = await req.json().catch(() => ({}));
        const question = typeof body.question === "string" ? body.question.trim() : "";
        if (!question) {
            return NextResponse.json({ error: "Manca il campo 'question'." }, { status: 400 });
        }

        const pdfBuffer = await getPdfBuffer(catalogId, parsedPdfId);
        if (!pdfBuffer) {
            return NextResponse.json({ error: "PDF non trovato o file non leggibile." }, { status: 404 });
        }
        if (pdfBuffer.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
            const mb = Math.round(pdfBuffer.length / 1024 / 1024);
            return NextResponse.json(
                {
                    error: `PDF troppo grande per la domanda (${mb} MB).`,
                    hint: "Usa un file sotto i 18 MB o dividi il catalogo in più PDF.",
                },
                { status: 413 }
            );
        }

        const normalized = await tryNormalizePdfBuffer(pdfBuffer);
        const forGemini = normalized ?? pdfBuffer;
        const { answer } = await askAboutPdf(forGemini.toString("base64"), question);
        return NextResponse.json({ answer });
    } catch (err: any) {
        console.error("[Gemini PDF] Ask error:", err);
        const message = err?.message || "Errore sconosciuto";
        const isConfig = message.includes("GEMINI_API_KEY");
        const isGemini = message.includes("Gemini") || message.includes("blocked") || message.includes("non supportato");
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

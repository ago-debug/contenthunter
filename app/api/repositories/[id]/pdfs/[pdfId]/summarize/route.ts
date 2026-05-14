import { NextRequest, NextResponse } from "next/server";
import { summarizePdf } from "@/lib/gemini-pdf";
import { openaiSummarizePdf } from "@/lib/openai-pdf";
import { ensureCatalogAccess, getSession } from "@/lib/auth-api";
import {
    assertAiCreditsSufficient,
    applyAiCreditDebit,
    getAiCreditChargePdfSummarize,
} from "@/lib/ai-credits";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { getPdfBuffer, tryNormalizePdfBuffer, MAX_PDF_SIZE_FOR_GEMINI_BYTES } from "@/lib/pdf-service";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";

export const maxDuration = 120;

/**
 * NotebookLM-style: summarize the PDF (overview, sections, page count).
 * Uses normalized PDF when possible; if normalization fails (e.g. PDF con molte immagini),
 * invia l'originale a Gemini che supporta più formati.
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
        const session = await getSession();
        const pdfGate = await assertCompanyFeatureEnabled(access.companyId, "pdfSuite", session);
        if (!pdfGate.ok) {
            return NextResponse.json({ error: pdfGate.message }, { status: 403 });
        }
        const creditCost = getAiCreditChargePdfSummarize();
        const creditPre = await assertAiCreditsSufficient(access.companyId, creditCost);
        if (!creditPre.ok) {
            return NextResponse.json({ error: creditPre.message }, { status: 402 });
        }
        const keys = await resolveIntegrationKeys(access.companyId);

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
        const forAi = normalized ?? pdfBuffer;
        const base64 = forAi.toString("base64");

        const provider = process.env.PDF_AI_PROVIDER || "gemini";
        const result =
            provider === "openai"
                ? await openaiSummarizePdf(base64, { openaiApiKey: keys.openai })
                : await summarizePdf(base64, { geminiApiKey: keys.gemini });
        try {
            await applyAiCreditDebit({
                companyId: access.companyId,
                userId: (session?.user as { userId?: number } | undefined)?.userId,
                amount: creditCost,
                reason: "pdf_summarize",
                meta: { catalogId, pdfId: parsedPdfId },
            });
        } catch (deErr) {
            console.warn("[ai-credits] addebito pdf_summarize:", deErr);
        }
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

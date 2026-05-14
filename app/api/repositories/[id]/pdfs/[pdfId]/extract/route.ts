import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractProductsFromPdf } from "@/lib/gemini-pdf";
import { openaiExtractProductsFromPdf } from "@/lib/openai-pdf";
import { ensureCatalogAccess, getSession } from "@/lib/auth-api";
import {
    assertAiCreditsSufficient,
    applyAiCreditDebit,
    getAiCreditChargePdfExtract,
} from "@/lib/ai-credits";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { getPdfBuffer, tryNormalizePdfBuffer, MAX_PDF_SIZE_FOR_GEMINI_BYTES } from "@/lib/pdf-service";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { importExtractedProductsToStaging } from "@/lib/catalog-pdf-staging-import";
import {
    extractPdfPageRangeToBuffer,
    getPdfPageCount,
    remapExtractedPageNumbersToGlobal,
} from "@/lib/pdf-page-range";

export const maxDuration = 300;
export const config = {
    api: { bodyParser: { sizeLimit: "100mb" } },
};

type ExtractBody = {
    pageFrom?: unknown;
    pageTo?: unknown;
    /** Se true, non svuota lo staging: aggiunge prodotti (batch 2+). */
    appendStaging?: unknown;
    /** Se false, non marca il PDF come processato né aggiorna lastListinoName (batch intermedi). */
    markPdfProcessed?: unknown;
};

function parsePositiveInt(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
    if (typeof v === "string" && v.trim()) {
        const n = parseInt(v.trim(), 10);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

/**
 * PDF extraction via Gemini / OpenAI. Opzionale estrazione per range di pagine (batch) per ridurre timeout e carico.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; pdfId: string }> }
) {
    const startTime = Date.now();
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id, 10);
        const parsedPdfId = parseInt(pdfId, 10);

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato o catalogo non trovato" }, { status: 403 });
        }
        const session = await getSession();
        const pdfGate = await assertCompanyFeatureEnabled(access.companyId, "pdfSuite", session);
        if (!pdfGate.ok) {
            return NextResponse.json({ error: pdfGate.message }, { status: 403 });
        }
        const creditCost = getAiCreditChargePdfExtract();
        const creditPre = await assertAiCreditsSufficient(access.companyId, creditCost);
        if (!creditPre.ok) {
            return NextResponse.json({ error: creditPre.message }, { status: 402 });
        }
        const keys = await resolveIntegrationKeys(access.companyId);

        let body: ExtractBody = {};
        try {
            const ct = req.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                body = (await req.json()) as ExtractBody;
            }
        } catch {
            body = {};
        }

        const pageFrom = parsePositiveInt(body.pageFrom);
        const pageTo = parsePositiveInt(body.pageTo);
        const hasPageRange = pageFrom != null && pageTo != null;
        if (hasPageRange && pageFrom > pageTo) {
            return NextResponse.json({ error: "pageFrom non può essere maggiore di pageTo." }, { status: 400 });
        }

        const appendStaging = body.appendStaging === true;
        const clearStagingFirst = !appendStaging;
        const markPdfProcessed = body.markPdfProcessed !== false;

        const pdfBuffer = await getPdfBuffer(catalogId, parsedPdfId);
        if (!pdfBuffer) {
            return NextResponse.json({ error: "PDF non trovato o file non leggibile." }, { status: 404 });
        }
        if (pdfBuffer.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
            const mb = Math.round(pdfBuffer.length / 1024 / 1024);
            return NextResponse.json(
                {
                    error: `PDF troppo grande per l'estrazione (${mb} MB).`,
                    hint: "Usa un file sotto i 18 MB o dividi il catalogo in più PDF.",
                },
                { status: 413 }
            );
        }

        const normalizedFull = await tryNormalizePdfBuffer(pdfBuffer);
        const baseFull = normalizedFull ?? pdfBuffer;

        let forAi: Buffer = baseFull;
        let totalPages: number | undefined;
        let effectivePageFrom = 1;
        let effectivePageTo = 1;

        if (hasPageRange && pageFrom != null && pageTo != null) {
            totalPages = await getPdfPageCount(baseFull);
            effectivePageFrom = Math.min(pageFrom, totalPages);
            effectivePageTo = Math.min(pageTo, totalPages);
            if (effectivePageFrom > effectivePageTo) {
                return NextResponse.json({ error: "Intervallo pagine fuori dal PDF." }, { status: 400 });
            }
            const sliced = await extractPdfPageRangeToBuffer(baseFull, effectivePageFrom, effectivePageTo);
            const normalizedSlice = await tryNormalizePdfBuffer(sliced);
            forAi = normalizedSlice ?? sliced;
        }

        if (forAi.length > MAX_PDF_SIZE_FOR_GEMINI_BYTES) {
            return NextResponse.json(
                {
                    error: "Lo slice PDF supera ancora il limite per l’AI. Riduci il numero di pagine per batch.",
                },
                { status: 413 }
            );
        }

        const pdfBase64 = forAi.toString("base64");

        const pageSlice =
            hasPageRange && pageFrom != null && pageTo != null
                ? { from: effectivePageFrom, to: effectivePageTo, totalPages }
                : undefined;

        let extractedProducts: any[];
        try {
            const provider = process.env.PDF_AI_PROVIDER || "gemini";
            const result =
                provider === "openai"
                    ? await openaiExtractProductsFromPdf(pdfBase64, { openaiApiKey: keys.openai, pageSlice })
                    : await extractProductsFromPdf(pdfBase64, { geminiApiKey: keys.gemini, pageSlice });
            extractedProducts = result?.products ?? [];
        } catch (geminiErr: any) {
            console.error("[Gemini PDF] Extract API error:", geminiErr);
            const msg = geminiErr?.message ?? "Errore sconosciuto";
            const hint =
                msg.includes("Ricarica") || msg.includes("normalizzazione")
                    ? undefined
                    : !process.env.GEMINI_API_KEY
                      ? "Imposta GEMINI_API_KEY in .env"
                      : msg.includes("JSON") || msg.includes("parse")
                        ? "La risposta di Gemini non è valida. Riprova o usa un PDF più semplice."
                        : "Verifica il PDF e riprova.";
            return NextResponse.json(
                { error: msg, hint },
                { status: 502 }
            );
        }
        if (!Array.isArray(extractedProducts)) {
            extractedProducts = [];
        }

        if (hasPageRange && pageFrom != null && pageTo != null) {
            remapExtractedPageNumbersToGlobal(extractedProducts, effectivePageFrom, effectivePageTo);
        }

        console.log("[Gemini PDF] Extracted", extractedProducts.length, "products.", {
            batch: hasPageRange ? { from: effectivePageFrom, to: effectivePageTo, append: appendStaging } : "full",
        });

        const { importedCount } = await importExtractedProductsToStaging({
            catalogId,
            pdfId: parsedPdfId,
            extractedProducts,
            clearStagingFirst,
        });

        if (markPdfProcessed) {
            const pdfMeta = await prisma.catalogPdf.findUnique({
                where: { id: parsedPdfId },
                select: { fileName: true },
            });
            await prisma.catalogPdf.update({
                where: { id: parsedPdfId },
                data: { processed: true },
            });
            await prisma.catalog.update({
                where: { id: catalogId },
                data: { lastListinoName: "Gemini_" + (pdfMeta?.fileName || "catalog") },
            });
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        try {
            await applyAiCreditDebit({
                companyId: access.companyId,
                userId: (session?.user as { userId?: number } | undefined)?.userId,
                amount: creditCost,
                reason: "pdf_extract",
                meta: { catalogId, pdfId: parsedPdfId, importedCount },
            });
        } catch (deErr) {
            console.warn("[ai-credits] addebito pdf_extract:", deErr);
        }

        return NextResponse.json({
            success: true,
            count: importedCount,
            duration: duration + "s",
            batch:
                hasPageRange && pageFrom != null && pageTo != null
                    ? {
                          pageFrom: effectivePageFrom,
                          pageTo: effectivePageTo,
                          appendStaging,
                          markPdfProcessed,
                          totalPages,
                      }
                    : undefined,
        });
    } catch (err: any) {
        console.error("[Gemini PDF] Extract error:", err);
        const message = err?.message || "Errore sconosciuto";
        const isConfig = message.includes("GEMINI_API_KEY") || message.includes("configured");
        return NextResponse.json(
            {
                error: message,
                hint: isConfig ? "Imposta GEMINI_API_KEY in .env" : "Verifica che il PDF sia valido e che il file esista sul server.",
                stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
            },
            { status: 500 }
        );
    }
}

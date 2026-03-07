import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { summarizePdf } from "@/lib/gemini-pdf";
import { ensureCatalogAccess } from "@/lib/auth-api";

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
        const catalogId = parseInt(id);
        const parsedPdfId = parseInt(pdfId);

        const access = await ensureCatalogAccess(req, catalogId);
        if (!access) {
            return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
        }

        const catalogPdf = await prisma.catalogPdf.findUnique({
            where: { id: parsedPdfId },
        });
        if (!catalogPdf) {
            return NextResponse.json({ error: "PDF not found." }, { status: 404 });
        }

        const safeFilePath = catalogPdf.filePath.startsWith("/") ? catalogPdf.filePath.slice(1) : catalogPdf.filePath;
        const fullPath = path.join(process.cwd(), "public", safeFilePath);
        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: "Physical file not found." }, { status: 404 });
        }

        const pdfBase64 = fs.readFileSync(fullPath).toString("base64");
        const result = await summarizePdf(pdfBase64);
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

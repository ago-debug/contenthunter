import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { buildTechnicalSheetPdf } from "@/lib/technical-sheet-pdf";
import { TECH_SHEET_TEXT_FIELDS } from "@/lib/technical-sheet-fields";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const id = parseInt((await params).id, 10);
    if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "ID non valido" }, { status: 400 });
    }
    const { searchParams } = new URL(req.url);
    const printHeader = searchParams.get("printHeader") !== "0";
    const printLogo = searchParams.get("printLogo") !== "0";

    try {
        const [p, company] = await Promise.all([
            prisma.product.findFirst({
                where: { id, companyId: ctx.companyId },
                include: {
                    texts: true,
                    extraFields: true,
                    technicalPackaging: { select: { id: true, name: true } },
                    technicalPalett: { select: { id: true, name: true } },
                },
            }),
            prisma.company.findUnique({
                where: { id: ctx.companyId },
                select: {
                    name: true,
                    technicalSheetPdfHeader: true,
                    technicalSheetPdfLogoUrl: true,
                },
            }),
        ]);
        if (!p || !company) {
            return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
        }

        const extraMap: Record<string, string> = {};
        for (const ex of p.extraFields) {
            extraMap[ex.key] = ex.value;
        }

        const it = p.texts.find((t) => t.language === "it");
        const titleIt = it?.title || "";
        const descriptionIt = it?.description || "";

        const sections = TECH_SHEET_TEXT_FIELDS.map((f) => ({
            title: f.label,
            body: extraMap[f.key] || "",
        })).filter((s) => s.body.trim());

        const pdfBytes = await buildTechnicalSheetPdf({
            companyName: company.name,
            printHeader,
            printLogo,
            headerHtmlOrText: company.technicalSheetPdfHeader || "",
            logoUrl: company.technicalSheetPdfLogoUrl || null,
            sku: p.sku,
            ean: p.ean,
            titleIt,
            descriptionIt,
            sections,
            logistics: {
                codiceArticolo: p.sku,
                codiceEan: p.ean || "—",
                packagingLabel: p.technicalPackaging?.name || "",
                packagingNote: p.technicalPackagingNote || "",
                palettLabel: p.technicalPalett?.name || "",
                palettNote: p.technicalPalettNote || "",
            },
        });

        const safeSku = p.sku.replace(/[^\w.-]+/g, "_").slice(0, 80);
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="scheda-tecnica-${safeSku}.pdf"`,
            },
        });
    } catch (e) {
        console.error("[technical-sheet-pdf]", e);
        return NextResponse.json({ error: "Errore generazione PDF" }, { status: 500 });
    }
}

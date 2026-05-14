import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const c = await prisma.company.findUnique({
            where: { id: ctx.companyId },
            select: {
                name: true,
                technicalSheetPdfHeader: true,
                technicalSheetPdfLogoUrl: true,
            },
        });
        if (!c) {
            return NextResponse.json({ error: "Azienda non trovata" }, { status: 404 });
        }
        return NextResponse.json({
            companyName: c.name,
            technicalSheetPdfHeader: c.technicalSheetPdfHeader ?? "",
            technicalSheetPdfLogoUrl: c.technicalSheetPdfLogoUrl ?? "",
        });
    } catch (e) {
        console.error("[technical-sheet-print GET]", e);
        return NextResponse.json({ error: "Errore lettura" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const body = await req.json();
        const header =
            body?.technicalSheetPdfHeader != null
                ? String(body.technicalSheetPdfHeader).slice(0, 65000)
                : undefined;
        const logoUrl =
            body?.technicalSheetPdfLogoUrl != null
                ? String(body.technicalSheetPdfLogoUrl).slice(0, 2000)
                : undefined;
        await prisma.company.update({
            where: { id: ctx.companyId },
            data: {
                ...(header !== undefined ? { technicalSheetPdfHeader: header || null } : {}),
                ...(logoUrl !== undefined ? { technicalSheetPdfLogoUrl: logoUrl.trim() || null } : {}),
            },
        });
        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("[technical-sheet-print PATCH]", e);
        return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const { id } = await params;
        const spiderId = parseInt(id, 10);
        if (!spiderId || Number.isNaN(spiderId)) {
            return NextResponse.json({ error: "spiderId non valido" }, { status: 400 });
        }

        const spider = await prisma.scrapeSpider.findFirst({
            where: {
                id: spiderId,
                project: {
                    companyId,
                },
            },
            select: { id: true },
        });
        if (!spider) {
            return NextResponse.json({ error: "Spider non trovato" }, { status: 404 });
        }

        await prisma.scrapeSpider.delete({
            where: { id: spiderId },
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error("[SCRAPING][SPIDERS][DELETE] error", err);
        return NextResponse.json({ error: "Errore durante l'eliminazione dello spider." }, { status: 500 });
    }
}


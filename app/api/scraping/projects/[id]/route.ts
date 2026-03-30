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
        const projectId = parseInt(id, 10);
        if (!projectId || Number.isNaN(projectId)) {
            return NextResponse.json({ error: "projectId non valido" }, { status: 400 });
        }

        const project = await prisma.scrapeProject.findFirst({
            where: { id: projectId, companyId },
            select: { id: true },
        });
        if (!project) {
            return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
        }

        await prisma.scrapeProject.delete({
            where: { id: projectId },
        });

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error("[SCRAPING][PROJECTS][DELETE] error", err);
        return NextResponse.json({ error: "Errore durante l'eliminazione del progetto." }, { status: 500 });
    }
}


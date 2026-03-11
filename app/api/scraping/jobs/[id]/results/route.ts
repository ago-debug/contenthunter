import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(
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
        const jobId = parseInt(id, 10);
        if (!jobId || Number.isNaN(jobId)) {
            return NextResponse.json({ error: "jobId non valido" }, { status: 400 });
        }

        // Verifica che il job appartenga a un progetto della stessa azienda
        const job = await prisma.scrapeJob.findFirst({
            where: {
                id: jobId,
                spider: {
                    project: {
                        companyId,
                    },
                },
            },
            select: { id: true },
        });
        if (!job) {
            return NextResponse.json({ error: "Job non trovato" }, { status: 404 });
        }

        const results = await prisma.scrapeResult.findMany({
            where: { jobId },
            orderBy: { id: "asc" },
        });

        return NextResponse.json(results);
    } catch (err: any) {
        console.error("[SCRAPING][JOB_RESULTS][GET] error", err);
        return NextResponse.json({ error: "Errore nel caricamento dei risultati di scraping." }, { status: 500 });
    }
}


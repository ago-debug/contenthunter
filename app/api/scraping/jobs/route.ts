import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

// Elenco job per spider o progetto
export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const url = new URL(req.url);
        const spiderIdParam = url.searchParams.get("spiderId");

        if (!spiderIdParam) {
            return NextResponse.json({ error: "spiderId obbligatorio" }, { status: 400 });
        }

        const spiderId = parseInt(spiderIdParam, 10);
        if (Number.isNaN(spiderId)) {
            return NextResponse.json({ error: "spiderId non valido" }, { status: 400 });
        }

        // Verifica che lo spider appartenga a un progetto della stessa azienda
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

        const jobs = await prisma.scrapeJob.findMany({
            where: { spiderId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return NextResponse.json(jobs);
    } catch (err: any) {
        console.error("[SCRAPING][JOBS][GET] error", err);
        return NextResponse.json({ error: "Errore nel caricamento dei job di scraping." }, { status: 500 });
    }
}

// Crea un nuovo job e mette in coda la prima pagina (startUrl).
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const body = await req.json();
        const spiderId = parseInt(body.spiderId, 10);

        if (!spiderId || Number.isNaN(spiderId)) {
            return NextResponse.json({ error: "spiderId obbligatorio" }, { status: 400 });
        }

        const spider = await prisma.scrapeSpider.findFirst({
            where: {
                id: spiderId,
                project: {
                    companyId,
                },
            },
            select: { id: true, startUrl: true },
        });
        if (!spider) {
            return NextResponse.json({ error: "Spider non trovato" }, { status: 404 });
        }

        // 1) Crea il job in stato pending
        const job = await prisma.scrapeJob.create({
            data: {
                spiderId,
                status: "pending",
            },
        });

        // 2) Metti in coda la prima pagina (startUrl o url passato nel body)
        const targetUrl: string | null = (body.url ?? spider.startUrl ?? null) || null;
        if (!targetUrl) {
            return NextResponse.json(
                { error: "Nessun URL di partenza definito per lo spider." },
                { status: 400 }
            );
        }

        await prisma.scrapePage.create({
            data: {
                jobId: job.id,
                url: targetUrl,
                status: "pending",
            },
        });

        return NextResponse.json(job, { status: 201 });
    } catch (err: any) {
        console.error("[SCRAPING][JOBS][POST] error", err);
        return NextResponse.json({ error: "Errore nella creazione del job di scraping." }, { status: 500 });
    }
}


import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

// Elenco spider per progetto
export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const url = new URL(req.url);
        const projectIdParam = url.searchParams.get("projectId");
        if (!projectIdParam) {
            return NextResponse.json({ error: "projectId obbligatorio" }, { status: 400 });
        }
        const projectId = parseInt(projectIdParam, 10);
        if (Number.isNaN(projectId)) {
            return NextResponse.json({ error: "projectId non valido" }, { status: 400 });
        }

        const project = await prisma.scrapeProject.findFirst({
            where: { id: projectId, companyId },
            select: { id: true },
        });
        if (!project) {
            return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
        }

        const spiders = await prisma.scrapeSpider.findMany({
            where: { projectId },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(spiders);
    } catch (err: any) {
        console.error("[SCRAPING][SPIDERS][GET] error", err);
        return NextResponse.json({ error: "Errore nel caricamento degli spider." }, { status: 500 });
    }
}

// Crea uno spider per un progetto
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const body = await req.json();
        const projectId = parseInt(body.projectId, 10);
        const name = (body.name ?? "").toString().trim();
        const startUrl = body.startUrl ? body.startUrl.toString() : null;
        const config = body.config ?? null;
        const template = body.template ?? null;

        if (!projectId || Number.isNaN(projectId)) {
            return NextResponse.json({ error: "projectId obbligatorio" }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: "Nome spider obbligatorio." }, { status: 400 });
        }

        const project = await prisma.scrapeProject.findFirst({
            where: { id: projectId, companyId },
            select: { id: true },
        });
        if (!project) {
            return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
        }

        const spider = await prisma.scrapeSpider.create({
            data: {
                projectId,
                name,
                startUrl,
                config,
                template,
            },
        });

        return NextResponse.json(spider, { status: 201 });
    } catch (err: any) {
        console.error("[SCRAPING][SPIDERS][POST] error", err);
        return NextResponse.json({ error: "Errore nella creazione dello spider." }, { status: 500 });
    }
}


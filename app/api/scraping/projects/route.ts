import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

// Elenco progetti scraping per azienda
export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const projects = await prisma.scrapeProject.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(projects);
    } catch (err: any) {
        console.error("[SCRAPING][PROJECTS][GET] error", err);
        return NextResponse.json({ error: "Errore nel caricamento dei progetti scraping." }, { status: 500 });
    }
}

// Crea un nuovo progetto scraping
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const body = await req.json();
        const name = (body.name ?? "").toString().trim();
        const description = body.description ? body.description.toString() : null;

        if (!name) {
            return NextResponse.json({ error: "Nome progetto obbligatorio." }, { status: 400 });
        }

        const project = await prisma.scrapeProject.create({
            data: {
                companyId,
                name,
                description,
            },
        });

        return NextResponse.json(project, { status: 201 });
    } catch (err: any) {
        console.error("[SCRAPING][PROJECTS][POST] error", err);
        return NextResponse.json({ error: "Errore nella creazione del progetto scraping." }, { status: 500 });
    }
}


import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const catalogues = await prisma.catalog.findMany({
            where: { companyId },
            include: {
                _count: {
                    select: {
                        entries: true,
                        stagingProducts: true
                    }
                },
                pdfs: true,
                searchSources: true
            },
            orderBy: { createdAt: "desc" }
        });
        return NextResponse.json(catalogues);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Database error";
        console.error("Fetch catalogues error:", err);
        return NextResponse.json(
            { error: message },
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const body = await req.json();
        const { name, imageFolderPath, pdfs } = body;

        const catalog = await prisma.catalog.create({
            data: {
                companyId,
                name: name || "Nuovo Progetto",
                imageFolderPath: imageFolderPath || null,
                status: "draft",
                pdfs: {
                    create: (pdfs || []).map((path: string) => ({
                        fileName: path.split('/').pop() || "catalogo.pdf",
                        filePath: path
                    }))
                }
            },
            include: {
                pdfs: true
            }
        });
        return NextResponse.json(catalog);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Create catalog error";
        console.error("Create catalog error:", err);
        return NextResponse.json(
            { error: message },
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const catalogues = await prisma.catalog.findMany({
            include: {
                _count: {
                    select: {
                        entries: true,
                        stagingProducts: true
                    }
                },
                pdfs: true
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
    try {
        const body = await req.json();
        const { name, imageFolderPath, pdfs } = body;

        const catalog = await prisma.catalog.create({
            data: {
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

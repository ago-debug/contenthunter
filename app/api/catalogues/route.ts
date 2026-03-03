import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const catalogues = await prisma.catalog.findMany({
            include: {
                _count: {
                    select: { entries: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(catalogues);
    } catch (err: any) {
        console.error("Fetch catalogues error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
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
    } catch (err: any) {
        console.error("Create catalog error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

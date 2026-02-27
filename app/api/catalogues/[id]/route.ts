import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idParam } = await params;
        const id = parseInt(idParam);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        const catalogue = await prisma.catalog.findUnique({
            where: { id },
            include: {
                products: {
                    include: { images: true },
                    orderBy: { createdAt: 'desc' }
                },
                searchSources: true
            }
        });

        if (!catalogue) {
            return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
        }

        return NextResponse.json(catalogue);
    } catch (err: any) {
        console.error("Fetch catalogue error details:", {
            message: err.message,
            stack: err.stack
        });
        return NextResponse.json({
            error: "Fetch failed",
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idParam } = await params;
        const id = parseInt(idParam);
        const body = await req.json();
        const { searchSources } = body;

        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        // Delete existing sources and recreate them for simplicity
        await prisma.searchSource.deleteMany({
            where: { catalogId: id }
        });

        if (searchSources && Array.isArray(searchSources)) {
            await prisma.searchSource.createMany({
                data: searchSources.map((source: any) => ({
                    catalogId: id,
                    url: source.url,
                    label: source.label || ''
                }))
            });
        }

        const updated = await prisma.catalog.findUnique({
            where: { id },
            include: { searchSources: true }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        console.error("Update catalogue error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: idParam } = await params;
        const id = parseInt(idParam);
        if (isNaN(id)) {
            return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
        }

        await prisma.catalog.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Delete catalogue error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

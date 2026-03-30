import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGlobalAdmin } from "@/lib/auth-api";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireGlobalAdmin();
    if (!session) {
        return NextResponse.json({ message: "Solo l'admin globale può visualizzare l'azienda" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
        where: { id },
        include: {
            _count: {
                select: { users: true, products: true, catalogs: true },
            },
        },
    });

    if (!company) {
        return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
    }

    return NextResponse.json({
        id: company.id,
        name: company.name,
        slug: company.slug,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        usersCount: company._count.users,
        productsCount: company._count.products,
        catalogsCount: company._count.catalogs,
    });
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireGlobalAdmin();
    if (!session) {
        return NextResponse.json({ message: "Solo l'admin globale può modificare l'azienda" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        const body = await req.json();
        const { name, slug } = body as { name?: string; slug?: string };

        const data: { name?: string; slug?: string } = {};
        if (name !== undefined) data.name = name.trim();
        if (slug !== undefined) data.slug = slug.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

        const company = await prisma.company.update({
            where: { id },
            data,
        });

        return NextResponse.json({
            id: company.id,
            name: company.name,
            slug: company.slug,
            updatedAt: company.updatedAt,
        });
    } catch (e: any) {
        if (e?.code === "P2025") {
            return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
        }
        if (e?.code === "P2002") {
            return NextResponse.json({ message: "Slug già utilizzato" }, { status: 400 });
        }
        console.error("Error updating company:", e);
        return NextResponse.json({ message: "Errore durante l'aggiornamento" }, { status: 500 });
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireGlobalAdmin();
    if (!session) {
        return NextResponse.json({ message: "Solo l'admin globale può eliminare un'azienda" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        await prisma.company.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e?.code === "P2025") {
            return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
        }
        console.error("Error deleting company:", e);
        return NextResponse.json({ message: "Errore durante l'eliminazione" }, { status: 500 });
    }
}

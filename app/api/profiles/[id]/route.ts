import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-api";
import { sanitizePermissions } from "@/lib/permissions";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["profiles:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
        where: { id },
        include: { _count: { select: { users: true } } },
    });

    if (!profile) {
        return NextResponse.json({ message: "Profilo non trovato" }, { status: 404 });
    }

    return NextResponse.json({
        id: profile.id,
        name: profile.name,
        description: profile.description,
        permissions: (profile.permissions as string[]) ?? [],
        usersCount: profile._count.users,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    });
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["profiles:write", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        const body = await req.json();
        const { name, description, permissions } = body as {
            name?: string;
            description?: string;
            permissions?: string[];
        };

        const data: { name?: string; description?: string | null; permissions?: string[] } = {};
        if (name !== undefined) data.name = name?.trim() ?? "";
        if (description !== undefined) data.description = description?.trim() || null;
        if (permissions !== undefined) data.permissions = sanitizePermissions(Array.isArray(permissions) ? permissions : []);

        const profile = await prisma.profile.update({
            where: { id },
            data,
        });

        return NextResponse.json({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            permissions: (profile.permissions as string[]) ?? [],
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        });
    } catch (e: any) {
        if (e?.code === "P2025") {
            return NextResponse.json({ message: "Profilo non trovato" }, { status: 404 });
        }
        console.error("Error updating profile:", e);
        return NextResponse.json(
            { message: "Errore durante l'aggiornamento del profilo" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["profiles:write", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        await prisma.profile.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        if (e?.code === "P2025") {
            return NextResponse.json({ message: "Profilo non trovato" }, { status: 404 });
        }
        if (e?.code === "P2003") {
            return NextResponse.json(
                { message: "Impossibile eliminare: ci sono utenti associati a questo profilo" },
                { status: 400 }
            );
        }
        console.error("Error deleting profile:", e);
        return NextResponse.json(
            { message: "Errore durante l'eliminazione del profilo" },
            { status: 500 }
        );
    }
}

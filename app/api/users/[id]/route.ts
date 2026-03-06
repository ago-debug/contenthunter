import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-api";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["users:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            profileId: true,
            profile: { select: { id: true, name: true } },
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!user) {
        return NextResponse.json({ message: "Utente non trovato" }, { status: 404 });
    }

    return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
        profileId: user.profileId,
        profileName: user.profile?.name ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    });
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["users:write", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        const body = await req.json();
        const { name, profileId } = body as { name?: string; profileId?: number | null };

        const data: { name?: string; profileId?: number | null } = {};
        if (name !== undefined) data.name = name?.trim() || null;
        if (profileId !== undefined) data.profileId = profileId === null || profileId === "" ? null : Number(profileId);

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                profileId: true,
                profile: { select: { id: true, name: true } },
                updatedAt: true,
            },
        });

        return NextResponse.json({
            id: user.id,
            name: user.name,
            email: user.email,
            profileId: user.profileId,
            profileName: user.profile?.name ?? null,
            updatedAt: user.updatedAt,
        });
    } catch (e: any) {
        if (e?.code === "P2025") {
            return NextResponse.json({ message: "Utente non trovato" }, { status: 404 });
        }
        if (e?.code === "P2003") {
            return NextResponse.json(
                { message: "Profilo non valido" },
                { status: 400 }
            );
        }
        console.error("Error updating user:", e);
        return NextResponse.json(
            { message: "Errore durante l'aggiornamento dell'utente" },
            { status: 500 }
        );
    }
}

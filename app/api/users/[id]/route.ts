import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission } from "@/lib/auth-api";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requirePermission(["users:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            companyId: true,
            company: { select: { id: true, name: true } },
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
        companyId: user.companyId,
        companyName: user.company?.name ?? null,
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

    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) {
        return NextResponse.json({ message: "ID non valido" }, { status: 400 });
    }

    try {
        const body = await req.json();
        const { name, email: bodyEmail, password: bodyPassword, profileId, companyId: bodyCompanyId } = body as {
            name?: string;
            email?: string;
            password?: string;
            profileId?: number | string | null;
            companyId?: number | string | null;
        };

        const data: {
            name?: string | null;
            email?: string;
            password?: string;
            profileId?: number | null;
            companyId?: number | null;
        } = {};
        if (name !== undefined) data.name = name?.trim() || null;
        if (profileId !== undefined) data.profileId = profileId === null || profileId === "" ? null : Number(profileId);
        if (session.user.isGlobalAdmin && bodyCompanyId !== undefined) {
            data.companyId = bodyCompanyId === null || bodyCompanyId === "" ? null : Number(bodyCompanyId);
        }

        if (bodyEmail !== undefined) {
            const email = bodyEmail?.trim();
            if (!email) {
                return NextResponse.json({ message: "Email obbligatoria" }, { status: 400 });
            }
            const existing = await prisma.user.findFirst({
                where: { email, NOT: { id } },
            });
            if (existing) {
                return NextResponse.json({ message: "Un altro utente ha già questa email" }, { status: 400 });
            }
            data.email = email;
        }

        if (bodyPassword !== undefined && String(bodyPassword).length > 0) {
            if (String(bodyPassword).length < 6) {
                return NextResponse.json({ message: "La password deve avere almeno 6 caratteri" }, { status: 400 });
            }
            data.password = await bcrypt.hash(String(bodyPassword), 10);
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                companyId: true,
                company: { select: { id: true, name: true } },
                profileId: true,
                profile: { select: { id: true, name: true } },
                updatedAt: true,
            },
        });

        return NextResponse.json({
            id: user.id,
            name: user.name,
            email: user.email,
            companyId: user.companyId,
            companyName: user.company?.name ?? null,
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

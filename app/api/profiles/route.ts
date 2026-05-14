import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-api";
import { sanitizePermissions } from "@/lib/permissions";

export async function GET() {
    const session = await requirePermission(["profiles:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const profiles = await prisma.profile.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { users: true } } },
    });

    return NextResponse.json(
        profiles.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            permissions: (p.permissions as string[]) ?? [],
            usersCount: p._count.users,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        }))
    );
}

export async function POST(req: Request) {
    const session = await requirePermission(["profiles:write", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { name, description, permissions } = body as {
            name?: string;
            description?: string;
            permissions?: string[];
        };

        if (!name?.trim()) {
            return NextResponse.json(
                { message: "Il nome del profilo è obbligatorio" },
                { status: 400 }
            );
        }

        const safePermissions = sanitizePermissions(Array.isArray(permissions) ? permissions : []);

        const profile = await prisma.profile.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                permissions: safePermissions,
            },
        });

        return NextResponse.json({
            id: profile.id,
            name: profile.name,
            description: profile.description,
            permissions: (profile.permissions as string[]) ?? [],
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        });
    } catch (e) {
        console.error("Error creating profile:", e);
        return NextResponse.json(
            { message: "Errore durante la creazione del profilo" },
            { status: 500 }
        );
    }
}

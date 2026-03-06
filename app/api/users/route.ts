import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-api";

export async function GET() {
    const session = await requirePermission(["users:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
        orderBy: { email: "asc" },
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

    return NextResponse.json(
        users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            profileId: u.profileId,
            profileName: u.profile?.name ?? null,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        }))
    );
}

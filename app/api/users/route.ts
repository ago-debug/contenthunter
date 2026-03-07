import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, getCompanyIdFromRequest } from "@/lib/auth-api";

export async function GET(req: Request) {
    const session = await requirePermission(["users:read", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    const companyIdFilter =
        session.user.companyId != null
            ? session.user.companyId
            : await getCompanyIdFromRequest(req);

    const where =
        companyIdFilter != null
            ? { companyId: companyIdFilter }
            : {}; // global admin senza filtro: vede tutti

    const users = await prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        select: {
            id: true,
            name: true,
            email: true,
            companyId: true,
            company: { select: { id: true, name: true, slug: true } },
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
            companyId: u.companyId,
            companyName: u.company?.name ?? null,
            profileId: u.profileId,
            profileName: u.profile?.name ?? null,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        }))
    );
}

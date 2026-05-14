import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, getCompanyIdFromRequest } from "@/lib/auth-api";
import { assertCanAddUser } from "@/lib/plan-limits";
import { CURRENT_TERMS_VERSION } from "@/lib/terms-version";
import { recordUserAudit } from "@/lib/user-audit";

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
            lastName: true,
            phone: true,
            fiscalCode: true,
            email: true,
            companyId: true,
            isActive: true,
            termsAcceptedAt: true,
            termsVersion: true,
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
            lastName: u.lastName,
            phone: u.phone,
            fiscalCode: u.fiscalCode,
            email: u.email,
            companyId: u.companyId,
            isActive: u.isActive,
            termsAcceptedAt: u.termsAcceptedAt,
            termsVersion: u.termsVersion,
            companyName: u.company?.name ?? null,
            profileId: u.profileId,
            profileName: u.profile?.name ?? null,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
        }))
    );
}

export async function POST(req: Request) {
    const session = await requirePermission(["users:write", "admin"]);
    if (!session) {
        return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { email, password, name, lastName, phone, fiscalCode, companyId, profileId, acceptTerms } =
            body as {
                email?: string;
                password?: string;
                name?: string;
                lastName?: string;
                phone?: string;
                fiscalCode?: string;
                companyId?: number | string | null;
                profileId?: number | string | null;
                acceptTerms?: boolean;
            };

        if (!email?.trim()) {
            return NextResponse.json({ message: "Email obbligatoria" }, { status: 400 });
        }
        if (!password || String(password).length < 6) {
            return NextResponse.json({ message: "Password obbligatoria (minimo 6 caratteri)" }, { status: 400 });
        }

        const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
        if (existing) {
            return NextResponse.json({ message: "Utente già esistente con questa email" }, { status: 400 });
        }

        let effectiveCompanyId: number | null = null;
        if (session.user.isGlobalAdmin) {
            const raw = companyId;
            effectiveCompanyId = raw == null || raw === "" ? null : Number(raw);
        } else {
            effectiveCompanyId = session.user.companyId ?? null;
        }

        if (effectiveCompanyId != null && Number.isFinite(effectiveCompanyId) && effectiveCompanyId > 0) {
            const cap = await assertCanAddUser(effectiveCompanyId);
            if (!cap.ok) {
                return NextResponse.json({ message: cap.message }, { status: 403 });
            }
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);

        const termsOk = !!acceptTerms;
        const user = await prisma.user.create({
            data: {
                email: email.trim(),
                password: hashedPassword,
                name: name?.trim() || null,
                lastName: lastName?.trim() || null,
                phone: phone?.trim() || null,
                fiscalCode: fiscalCode?.trim().toUpperCase().replace(/\s+/g, "") || null,
                companyId: effectiveCompanyId,
                profileId: profileId == null || profileId === "" ? null : Number(profileId),
                isActive: true,
                emailVerifiedAt: new Date(),
                emailVerificationToken: null,
                emailVerificationExpires: null,
                termsAcceptedAt: termsOk ? new Date() : null,
                termsVersion: termsOk ? CURRENT_TERMS_VERSION : null,
            },
            select: {
                id: true,
                name: true,
                lastName: true,
                phone: true,
                fiscalCode: true,
                email: true,
                companyId: true,
                company: { select: { id: true, name: true } },
                profileId: true,
                profile: { select: { id: true, name: true } },
                termsAcceptedAt: true,
                termsVersion: true,
                createdAt: true,
            },
        });

        await recordUserAudit({
            userId: user.id,
            action: "user_created",
            details: { byAdminId: session.user?.userId ?? null },
        });

        return NextResponse.json({
            id: user.id,
            name: user.name,
            lastName: user.lastName,
            phone: user.phone,
            fiscalCode: user.fiscalCode,
            email: user.email,
            companyId: user.companyId,
            companyName: user.company?.name ?? null,
            profileId: user.profileId,
            profileName: user.profile?.name ?? null,
            termsAcceptedAt: user.termsAcceptedAt,
            termsVersion: user.termsVersion,
            createdAt: user.createdAt,
        }, { status: 201 });
    } catch (e) {
        console.error("Error creating user:", e);
        return NextResponse.json({ message: "Errore durante la creazione dell'utente" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireGlobalAdmin, requirePermission } from "@/lib/auth-api";
import { CURRENT_TERMS_VERSION } from "@/lib/terms-version";
import { recordUserAudit } from "@/lib/user-audit";

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session =
        (await requirePermission(["users:read", "admin"])) ?? (await requireGlobalAdmin());
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
            lastName: true,
            phone: true,
            fiscalCode: true,
            email: true,
            companyId: true,
            isActive: true,
            termsAcceptedAt: true,
            termsVersion: true,
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

    if (!session.user.isGlobalAdmin) {
        if (user.companyId == null || user.companyId !== session.user.companyId) {
            return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
        }
    }

    return NextResponse.json({
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        phone: user.phone,
        fiscalCode: user.fiscalCode,
        email: user.email,
        companyId: user.companyId,
        companyName: user.company?.name ?? null,
        isActive: user.isActive,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
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
    const session =
        (await requirePermission(["users:write", "admin"])) ?? (await requireGlobalAdmin());
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
        const {
            name,
            lastName: bodyLastName,
            phone: bodyPhone,
            fiscalCode: bodyFiscalCode,
            email: bodyEmail,
            password: bodyPassword,
            profileId,
            companyId: bodyCompanyId,
            isActive: bodyIsActive,
            acceptTerms,
        } = body as {
            name?: string;
            lastName?: string | null;
            phone?: string | null;
            fiscalCode?: string | null;
            email?: string;
            password?: string;
            profileId?: number | string | null;
            companyId?: number | string | null;
            isActive?: boolean;
            acceptTerms?: boolean;
        };

        const target = await prisma.user.findUnique({
            where: { id },
            select: { id: true, companyId: true },
        });
        if (!target) {
            return NextResponse.json({ message: "Utente non trovato" }, { status: 404 });
        }

        if (!session.user.isGlobalAdmin) {
            if (target.companyId == null || target.companyId !== session.user.companyId) {
                return NextResponse.json({ message: "Non autorizzato" }, { status: 403 });
            }
        }

        if (bodyIsActive !== undefined) {
            if (!session.user.isGlobalAdmin) {
                return NextResponse.json(
                    { message: "Solo l’admin globale può attivare o disattivare l’accesso utente" },
                    { status: 403 }
                );
            }
        }

        const data: {
            name?: string | null;
            lastName?: string | null;
            phone?: string | null;
            fiscalCode?: string | null;
            email?: string;
            password?: string;
            profileId?: number | null;
            companyId?: number | null;
            isActive?: boolean;
            termsAcceptedAt?: Date | null;
            termsVersion?: string | null;
        } = {};
        if (name !== undefined) data.name = name?.trim() || null;
        if (bodyLastName !== undefined) data.lastName = bodyLastName?.trim() || null;
        if (bodyPhone !== undefined) data.phone = bodyPhone?.trim() || null;
        if (bodyFiscalCode !== undefined) {
            const fc = bodyFiscalCode?.trim();
            data.fiscalCode = fc ? fc.toUpperCase().replace(/\s+/g, "") : null;
        }
        if (bodyIsActive !== undefined) data.isActive = !!bodyIsActive;
        if (profileId !== undefined) data.profileId = profileId === null || profileId === "" ? null : Number(profileId);
        if (session.user.isGlobalAdmin && bodyCompanyId !== undefined) {
            data.companyId = bodyCompanyId === null || bodyCompanyId === "" ? null : Number(bodyCompanyId);
        }
        if (acceptTerms === true) {
            data.termsAcceptedAt = new Date();
            data.termsVersion = CURRENT_TERMS_VERSION;
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

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ message: "Nessun campo da aggiornare" }, { status: 400 });
        }

        const user = await prisma.user.update({
            where: { id },
            data,
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
                company: { select: { id: true, name: true } },
                profileId: true,
                profile: { select: { id: true, name: true } },
                updatedAt: true,
            },
        });

        const changedKeys = Object.keys(data).filter((k) => k !== "password");
        const passwordChanged = !!data.password;
        await recordUserAudit({
            userId: id,
            action: "profile_updated",
            details: {
                changedKeys,
                passwordChanged,
                editorUserId: session.user?.userId ?? null,
            },
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
            isActive: user.isActive,
            termsAcceptedAt: user.termsAcceptedAt,
            termsVersion: user.termsVersion,
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

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireGlobalAdmin } from "@/lib/auth-api";
import { slugifyCompanyName } from "@/lib/company-slug";
import {
    bodyHasAnagraficaKeys,
    companyAnagraficaToJson,
    companyAnagraficaUpdateFromBody,
} from "@/lib/company-anagrafica";

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
            users: {
                orderBy: { email: "asc" },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    isActive: true,
                    profileId: true,
                    profile: { select: { id: true, name: true } },
                    createdAt: true,
                },
            },
            aiCreditLedgers: {
                orderBy: { createdAt: "desc" },
                take: 50,
                select: {
                    id: true,
                    delta: true,
                    balanceAfter: true,
                    reason: true,
                    createdAt: true,
                    userId: true,
                },
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
        onboardingStatus: company.onboardingStatus,
        subscriptionPlan: company.subscriptionPlan,
        maxProducts: company.maxProducts,
        maxUsers: company.maxUsers,
        featureSeoGeo: company.featureSeoGeo,
        featurePdfSuite: company.featurePdfSuite,
        aiCreditsBalance: company.aiCreditsBalance.toString(),
        anagrafica: companyAnagraficaToJson(company),
        users: company.users,
        aiCreditLedgers: company.aiCreditLedgers.map((r) => ({
            id: r.id,
            delta: r.delta.toString(),
            balanceAfter: r.balanceAfter.toString(),
            reason: r.reason,
            createdAt: r.createdAt,
            userId: r.userId,
        })),
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
        const bodyRec = body as Record<string, unknown>;
        const anagraficaPatch = companyAnagraficaUpdateFromBody(bodyRec);
        const hasAnagraficaBody = bodyHasAnagraficaKeys(bodyRec);
        const {
            name,
            slug: slugRaw,
            onboardingStatus,
            subscriptionPlan,
            maxProducts,
            maxUsers,
            featureSeoGeo,
            featurePdfSuite,
            aiCreditDelta,
            aiCreditReason,
        } = body as {
            name?: string;
            slug?: string;
            onboardingStatus?: string;
            subscriptionPlan?: string;
            maxProducts?: number | null;
            maxUsers?: number | null;
            featureSeoGeo?: boolean;
            featurePdfSuite?: boolean;
            /** Aggiungi (o sottrai) crediti AI: movimento su ledger + aggiornamento saldo */
            aiCreditDelta?: number | string | null;
            aiCreditReason?: string;
        };

        const existing = await prisma.company.findUnique({
            where: { id },
            select: { aiCreditsBalance: true },
        });
        if (!existing) {
            return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
        }

        const data: Prisma.CompanyUpdateInput = { ...anagraficaPatch };
        const hasAnyField =
            name !== undefined ||
            slugRaw !== undefined ||
            onboardingStatus !== undefined ||
            subscriptionPlan !== undefined ||
            maxProducts !== undefined ||
            maxUsers !== undefined ||
            featureSeoGeo !== undefined ||
            featurePdfSuite !== undefined ||
            hasAnagraficaBody;
        if (name !== undefined) data.name = name.trim();
        if (slugRaw !== undefined) {
            const s = slugifyCompanyName(String(slugRaw));
            if (s) data.slug = s;
        }
        if (onboardingStatus !== undefined) {
            const s = String(onboardingStatus).trim().slice(0, 32);
            if (s) data.onboardingStatus = s;
        }
        if (subscriptionPlan !== undefined) {
            const s = String(subscriptionPlan).trim().toLowerCase().slice(0, 24);
            if (s) data.subscriptionPlan = s;
        }
        if (maxProducts !== undefined) {
            if (maxProducts === null) data.maxProducts = null;
            else {
                const n = Math.floor(Number(maxProducts));
                data.maxProducts = Number.isFinite(n) ? Math.max(0, n) : null;
            }
        }
        if (maxUsers !== undefined) {
            if (maxUsers === null) data.maxUsers = null;
            else {
                const n = Math.floor(Number(maxUsers));
                data.maxUsers = Number.isFinite(n) ? Math.max(0, n) : null;
            }
        }
        if (featureSeoGeo !== undefined) data.featureSeoGeo = !!featureSeoGeo;
        if (featurePdfSuite !== undefined) data.featurePdfSuite = !!featurePdfSuite;

        const hasDelta =
            aiCreditDelta !== undefined &&
            aiCreditDelta !== null &&
            String(aiCreditDelta).trim() !== "" &&
            Number.isFinite(Number(aiCreditDelta)) &&
            Number(aiCreditDelta) !== 0;

        if (!hasDelta && !hasAnyField) {
            const c = await prisma.company.findUnique({
                where: { id },
                include: { _count: { select: { users: true, products: true, catalogs: true } } },
            });
            if (!c) return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
            return NextResponse.json({
                id: c.id,
                name: c.name,
                slug: c.slug,
                updatedAt: c.updatedAt,
                onboardingStatus: c.onboardingStatus,
                subscriptionPlan: c.subscriptionPlan,
                maxProducts: c.maxProducts,
                maxUsers: c.maxUsers,
                featureSeoGeo: c.featureSeoGeo,
                featurePdfSuite: c.featurePdfSuite,
                aiCreditsBalance: c.aiCreditsBalance.toString(),
                usersCount: c._count.users,
                productsCount: c._count.products,
                catalogsCount: c._count.catalogs,
            });
        }

        if (hasDelta) {
            const delta = new Prisma.Decimal(String(aiCreditDelta));
            const prev = existing.aiCreditsBalance;
            const nextBal = prev.add(delta);
            if (nextBal.lessThan(0)) {
                return NextResponse.json(
                    { message: "Saldo crediti insufficiente per questa operazione" },
                    { status: 400 }
                );
            }
            const reason = (aiCreditReason && String(aiCreditReason).trim().slice(0, 64)) || "admin_adjust";

            await prisma.$transaction(async (tx) => {
                await tx.company.update({
                    where: { id },
                    data: { ...data, aiCreditsBalance: nextBal },
                });
                await tx.aiCreditLedger.create({
                    data: {
                        companyId: id,
                        userId: session.user?.userId ?? null,
                        delta,
                        balanceAfter: nextBal,
                        reason,
                    },
                });
            });

            const fresh = await prisma.company.findUnique({
                where: { id },
                include: {
                    _count: { select: { users: true, products: true, catalogs: true } },
                },
            });
            if (!fresh) {
                return NextResponse.json({ message: "Azienda non trovata" }, { status: 404 });
            }
            return NextResponse.json({
                id: fresh.id,
                name: fresh.name,
                slug: fresh.slug,
                updatedAt: fresh.updatedAt,
                onboardingStatus: fresh.onboardingStatus,
                subscriptionPlan: fresh.subscriptionPlan,
                maxProducts: fresh.maxProducts,
                maxUsers: fresh.maxUsers,
                featureSeoGeo: fresh.featureSeoGeo,
                featurePdfSuite: fresh.featurePdfSuite,
                aiCreditsBalance: fresh.aiCreditsBalance.toString(),
                usersCount: fresh._count.users,
                productsCount: fresh._count.products,
                catalogsCount: fresh._count.catalogs,
            });
        }

        const company = await prisma.company.update({
            where: { id },
            data,
            include: {
                _count: { select: { users: true, products: true, catalogs: true } },
            },
        });

        return NextResponse.json({
            id: company.id,
            name: company.name,
            slug: company.slug,
            updatedAt: company.updatedAt,
            onboardingStatus: company.onboardingStatus,
            subscriptionPlan: company.subscriptionPlan,
            maxProducts: company.maxProducts,
            maxUsers: company.maxUsers,
            featureSeoGeo: company.featureSeoGeo,
            featurePdfSuite: company.featurePdfSuite,
            aiCreditsBalance: company.aiCreditsBalance.toString(),
            usersCount: company._count.users,
            productsCount: company._count.products,
            catalogsCount: company._count.catalogs,
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

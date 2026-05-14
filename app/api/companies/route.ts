import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireGlobalAdmin } from "@/lib/auth-api";
import { randomSlugSuffix, slugifyCompanyName } from "@/lib/company-slug";
import { companyAnagraficaUpdateFromBody } from "@/lib/company-anagrafica";

export async function GET() {
    const session = await requireGlobalAdmin();
    if (!session) {
        return NextResponse.json({ message: "Solo l'admin globale può visualizzare le aziende" }, { status: 403 });
    }

    const companies = await prisma.company.findMany({
        orderBy: { name: "asc" },
        include: {
            _count: {
                select: { users: true, products: true, catalogs: true },
            },
        },
    });

    return NextResponse.json(
        companies.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            usersCount: c._count.users,
            productsCount: c._count.products,
            catalogsCount: c._count.catalogs,
            onboardingStatus: c.onboardingStatus,
            subscriptionPlan: c.subscriptionPlan,
            maxProducts: c.maxProducts,
            maxUsers: c.maxUsers,
            featureSeoGeo: c.featureSeoGeo,
            featurePdfSuite: c.featurePdfSuite,
            aiCreditsBalance: c.aiCreditsBalance?.toString?.() ?? String(c.aiCreditsBalance),
        }))
    );
}

export async function POST(req: Request) {
    const session = await requireGlobalAdmin();
    if (!session) {
        return NextResponse.json({ message: "Solo l'admin globale può creare aziende" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const bodyRec = body as Record<string, unknown>;
        const { name, slug } = body as { name?: string; slug?: string };
        const anagraficaCreate = companyAnagraficaUpdateFromBody(bodyRec);

        if (!name?.trim()) {
            return NextResponse.json({ message: "Il nome è obbligatorio" }, { status: 400 });
        }

        let slugValue = slug?.trim() ? slugifyCompanyName(slug) : slugifyCompanyName(name);
        if (!slugValue) {
            return NextResponse.json({ message: "Slug non valido" }, { status: 400 });
        }

        let company;
        try {
            company = await prisma.company.create({
                data: {
                    name: name.trim(),
                    slug: slugValue,
                    ...anagraficaCreate,
                },
            });
        } catch (e: any) {
            if (e?.code === "P2002") {
                slugValue = `${slugValue}-${randomSlugSuffix(6)}`;
                company = await prisma.company.create({
                    data: {
                        name: name.trim(),
                        slug: slugValue,
                        ...anagraficaCreate,
                    },
                });
            } else {
                throw e;
            }
        }

        return NextResponse.json({
            id: company.id,
            name: company.name,
            slug: company.slug,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
        });
    } catch (e: any) {
        if (e?.code === "P2002") {
            return NextResponse.json({ message: "Slug già utilizzato" }, { status: 400 });
        }
        console.error("Error creating company:", e);
        return NextResponse.json({ message: "Errore durante la creazione dell'azienda" }, { status: 500 });
    }
}

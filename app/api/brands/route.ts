import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const brands = await prisma.brand.findMany({
            where: { companyId },
            orderBy: { name: 'asc' },
            include: { _count: { select: { products: true } } }
        });
        return NextResponse.json(brands.map(({ _count, ...b }) => ({ ...b, productCount: _count.products })));
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { name, logoUrl, aiContentGuidelines, producerDomain } = await req.json();
        const brand = await prisma.brand.create({
            data: {
                companyId,
                name,
                logoUrl: logoUrl || null,
                aiContentGuidelines: aiContentGuidelines || null,
                producerDomain: producerDomain || null
            }
        });
        return NextResponse.json(brand);
    } catch (err) {
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}

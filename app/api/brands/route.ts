import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const brands = await prisma.brand.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { products: true } } }
        });
        return NextResponse.json(brands.map(({ _count, ...b }) => ({ ...b, productCount: _count.products })));
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { name, logoUrl, aiContentGuidelines, producerDomain } = await req.json();
        const brand = await prisma.brand.create({
            data: {
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

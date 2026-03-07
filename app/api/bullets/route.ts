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
        const bullets = await prisma.bulletPoint.findMany({
            where: { companyId },
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(bullets);
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch bullets" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { content, productId } = await req.json();
        const bullet = await prisma.bulletPoint.create({
            data: {
                companyId,
                content,
                productId: productId ? Number(productId) : null
            }
        });
        return NextResponse.json(bullet);
    } catch (err) {
        return NextResponse.json({ error: "Failed to create bullet" }, { status: 500 });
    }
}

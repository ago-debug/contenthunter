import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id } = await params;
        const { content, productId } = await req.json();
        const existing = await prisma.bulletPoint.findFirst({
            where: { id: Number(id), companyId },
            select: { id: true },
        });
        if (!existing) return NextResponse.json({ error: "Bullet non trovato" }, { status: 404 });
        const bullet = await prisma.bulletPoint.update({
            where: { id: Number(id) },
            data: {
                content,
                productId: productId ? Number(productId) : null
            }
        });
        return NextResponse.json(bullet);
    } catch (err) {
        return NextResponse.json({ error: "Failed to update bullet" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id } = await params;
        const deleted = await prisma.bulletPoint.deleteMany({
            where: { id: Number(id), companyId }
        });
        if (deleted.count === 0) return NextResponse.json({ error: "Bullet non trovato" }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete bullet" }, { status: 500 });
    }
}

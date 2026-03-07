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
        const existing = await prisma.category.findFirst({ where: { id: Number(id), companyId } });
        if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });
        const { name, parentId } = await req.json();
        const category = await prisma.category.update({
            where: { id: Number(id) },
            data: {
                name,
                parentId: parentId ? Number(parentId) : null
            }
        });
        return NextResponse.json(category);
    } catch (err) {
        return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
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
        const deleted = await prisma.category.deleteMany({ where: { id: Number(id), companyId } });
        if (deleted.count === 0) return NextResponse.json({ error: "Category not found" }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
    }
}

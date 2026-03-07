import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id } = await params;
        const brand = await prisma.brand.findFirst({
            where: { id: Number(id), companyId },
            include: { _count: { select: { products: true } } }
        });
        if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
        const { _count, ...rest } = brand;
        return NextResponse.json({ ...rest, productCount: _count.products });
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch brand" }, { status: 500 });
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { id } = await params;
        const existing = await prisma.brand.findFirst({ where: { id: Number(id), companyId } });
        if (!existing) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
        const { name, logoUrl, aiContentGuidelines, producerDomain } = await req.json();
        const brand = await prisma.brand.update({
            where: { id: Number(id) },
            data: {
                ...(name !== undefined && { name }),
                ...(logoUrl !== undefined && { logoUrl }),
                ...(aiContentGuidelines !== undefined && { aiContentGuidelines: aiContentGuidelines || null }),
                ...(producerDomain !== undefined && { producerDomain: producerDomain || null })
            }
        });
        return NextResponse.json(brand);
    } catch (err) {
        return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
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
        const deleted = await prisma.brand.deleteMany({ where: { id: Number(id), companyId } });
        if (deleted.count === 0) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}

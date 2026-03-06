import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const brand = await prisma.brand.findUnique({
            where: { id: Number(id) },
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
    try {
        const { id } = await params;
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
    try {
        const { id } = await params;
        await prisma.brand.delete({
            where: { id: Number(id) }
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}

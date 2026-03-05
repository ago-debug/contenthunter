import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { name, logoUrl, aiContentGuidelines } = await req.json();
        const brand = await prisma.brand.update({
            where: { id: Number(id) },
            data: {
                ...(name !== undefined && { name }),
                ...(logoUrl !== undefined && { logoUrl }),
                ...(aiContentGuidelines !== undefined && { aiContentGuidelines: aiContentGuidelines || null })
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { content, productId } = await req.json();
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
    try {
        const { id } = await params;
        await prisma.bulletPoint.delete({
            where: { id: Number(id) }
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete bullet" }, { status: 500 });
    }
}

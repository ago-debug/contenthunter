import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
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
    try {
        const { id } = await params;
        await prisma.category.delete({
            where: { id: Number(id) }
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
    }
}

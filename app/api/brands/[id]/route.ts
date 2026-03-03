import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const { name, logoUrl } = await req.json();
        const brand = await prisma.brand.update({
            where: { id: Number(params.id) },
            data: { name, logoUrl }
        });
        return NextResponse.json(brand);
    } catch (err) {
        return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        await prisma.brand.delete({
            where: { id: Number(params.id) }
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}

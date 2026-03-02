import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const isAll = searchParams.get('all') === 'true';
        const parentId = searchParams.get('parentId') ? parseInt(searchParams.get('parentId')!) : null;

        const categories = await prisma.category.findMany({
            where: isAll ? undefined : {
                parentId: parentId
            },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(categories);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { name, parentId } = await req.json();
        if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

        const category = await prisma.category.create({
            data: {
                name,
                parentId: parentId || null
            }
        });

        return NextResponse.json(category);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const bullets = await prisma.bulletPoint.findMany({
            include: { product: true },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(bullets);
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch bullets" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { content, productId } = await req.json();
        const bullet = await prisma.bulletPoint.create({
            data: {
                content,
                productId: productId ? Number(productId) : null
            }
        });
        return NextResponse.json(bullet);
    } catch (err) {
        return NextResponse.json({ error: "Failed to create bullet" }, { status: 500 });
    }
}

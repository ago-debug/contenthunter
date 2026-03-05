import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const brands = await prisma.brand.findMany({
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(brands);
    } catch (err) {
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { name, logoUrl, aiContentGuidelines } = await req.json();
        const brand = await prisma.brand.create({
            data: { name, logoUrl, aiContentGuidelines: aiContentGuidelines || null }
        });
        return NextResponse.json(brand);
    } catch (err) {
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}

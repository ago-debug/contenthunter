import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const catalogues = await prisma.catalog.findMany({
            include: {
                _count: {
                    select: { products: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(catalogues);
    } catch (err: any) {
        console.error("Fetch catalogues error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

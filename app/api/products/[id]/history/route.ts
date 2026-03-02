import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const productId = parseInt(params.id);
        const history = await prisma.productHistory.findMany({
            where: { productId },
            orderBy: { createdAt: "desc" },
            take: 20
        });

        return NextResponse.json(history);
    } catch (err: any) {
        console.error("Fetch history error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

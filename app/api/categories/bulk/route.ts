import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ids, action } = body as { ids: number[]; action: string };

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
        }

        if (action === "delete") {
            await prisma.category.deleteMany({
                where: { id: { in: ids } }
            });
            return NextResponse.json({ success: true, count: ids.length });
        }

        return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    } catch (err: any) {
        console.error("Bulk categories error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

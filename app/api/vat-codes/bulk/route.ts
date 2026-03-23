import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const body = await req.json();
        const { ids, action } = body as { ids: number[]; action: string };

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
        }

        if (action === "delete") {
            await prisma.vatCode.deleteMany({
                where: {
                    id: { in: ids },
                    companyId: ctx.companyId,
                },
            });
            return NextResponse.json({ success: true, count: ids.length });
        }

        return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    } catch (err: any) {
        console.error("vat-codes bulk error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

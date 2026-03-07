import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q') || "";

        const tags = await prisma.tag.findMany({
            where: {
                companyId,
                name: { contains: query }
            },
            take: 50
        });

        return NextResponse.json(tags);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    try {
        const { name } = await req.json();
        if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

        const tag = await prisma.tag.create({
            data: { companyId, name }
        });

        return NextResponse.json(tag);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

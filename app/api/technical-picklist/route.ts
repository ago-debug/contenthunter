import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { isAllowedTechnicalPicklistCategory } from "@/lib/technical-sheet-fields";

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const category = String(searchParams.get("category") || "").trim();
    if (!isAllowedTechnicalPicklistCategory(category)) {
        return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
    }
    try {
        const items = await prisma.technicalPicklistItem.findMany({
            where: { companyId: ctx.companyId, category },
            orderBy: { name: "asc" },
            select: { id: true, name: true, description: true },
        });
        return NextResponse.json({ items });
    } catch (e) {
        console.error("[technical-picklist GET]", e);
        return NextResponse.json({ error: "Errore lettura elenco" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const body = await req.json();
        const category = String(body?.category || "").trim();
        const name = String(body?.name || "").trim().slice(0, 512);
        const description =
            body?.description != null ? String(body.description).slice(0, 65000) : null;
        if (!isAllowedTechnicalPicklistCategory(category)) {
            return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
        }
        if (!name) {
            return NextResponse.json({ error: "Nome obbligatorio" }, { status: 400 });
        }
        const existing = await prisma.technicalPicklistItem.findFirst({
            where: { companyId: ctx.companyId, category, name },
            select: { id: true },
        });
        let row;
        if (existing) {
            row = await prisma.technicalPicklistItem.update({
                where: { id: existing.id },
                data: { description: description !== null ? description : undefined },
                select: { id: true, name: true, description: true },
            });
        } else {
            row = await prisma.technicalPicklistItem.create({
                data: {
                    companyId: ctx.companyId,
                    category,
                    name,
                    description: description || null,
                },
                select: { id: true, name: true, description: true },
            });
        }
        return NextResponse.json(row);
    } catch (e: any) {
        console.error("[technical-picklist POST]", e);
        return NextResponse.json({ error: "Errore salvataggio voce" }, { status: 500 });
    }
}

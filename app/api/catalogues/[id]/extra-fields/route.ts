import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalogue ID" }, { status: 400 });
        }

        // Verifica appartenenza catalogo all'azienda
        const catalogue = await prisma.catalog.findFirst({
            where: { id: catalogId, companyId: ctx.companyId },
            select: { id: true }
        });
        if (!catalogue) {
            return NextResponse.json({ error: "Catalogue not found" }, { status: 404 });
        }

        const items = await prisma.extraFieldTemplate.findMany({
            where: {
                companyId: ctx.companyId,
                catalogId
            },
            orderBy: { createdAt: "asc" }
        });

        return NextResponse.json(items);
    } catch (err: any) {
        console.error("ExtraFieldTemplate GET error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    try {
        const { id } = await params;
        const catalogId = parseInt(id);
        if (isNaN(catalogId)) {
            return NextResponse.json({ error: "Invalid catalogue ID" }, { status: 400 });
        }

        const body = await req.json();
        const rawLabel = (body?.label || "").toString().trim();
        const rawKey = (body?.key || "").toString().trim();

        if (!rawLabel) {
            return NextResponse.json({ error: "Label obbligatoria" }, { status: 400 });
        }

        // genera una chiave "tecnica" se non arriva esplicita
        const baseKey = (rawKey || rawLabel)
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");

        if (!baseKey) {
            return NextResponse.json({ error: "Chiave non valida" }, { status: 400 });
        }

        // evita collisioni di chiave sullo stesso catalogo
        let finalKey = baseKey;
        let suffix = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const existing = await prisma.extraFieldTemplate.findFirst({
                where: { companyId: ctx.companyId, catalogId, key: finalKey }
            });
            if (!existing) break;
            finalKey = `${baseKey}_${suffix++}`;
        }

        const created = await prisma.extraFieldTemplate.create({
            data: {
                companyId: ctx.companyId,
                catalogId,
                key: finalKey,
                label: rawLabel
            }
        });

        return NextResponse.json(created, { status: 201 });
    } catch (err: any) {
        console.error("ExtraFieldTemplate POST error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}


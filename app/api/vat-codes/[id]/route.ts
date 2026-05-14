import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { Prisma } from "@prisma/client";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
            return NextResponse.json({ error: "ID non valido" }, { status: 400 });
        }

        const existing = await prisma.vatCode.findFirst({
            where: { id, companyId: ctx.companyId },
        });
        if (!existing) {
            return NextResponse.json({ error: "Codice IVA non trovato" }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const code = body.code != null ? String(body.code).trim().toUpperCase() : existing.code;
        const label =
            body.label !== undefined
                ? body.label != null && String(body.label).trim()
                    ? String(body.label).trim()
                    : null
                : existing.label;

        let rateNum: number;
        if (body.ratePercent !== undefined && body.ratePercent !== null && body.ratePercent !== "") {
            const r =
                typeof body.ratePercent === "number"
                    ? body.ratePercent
                    : parseFloat(String(body.ratePercent).replace(",", "."));
            if (Number.isNaN(r) || r < 0 || r > 100) {
                return NextResponse.json({ error: "Aliquota % deve essere tra 0 e 100" }, { status: 400 });
            }
            rateNum = r;
        } else {
            rateNum = Number(existing.ratePercent.toString());
        }

        const row = await prisma.vatCode.update({
            where: { id },
            data: {
                code,
                label,
                ratePercent: new Prisma.Decimal(rateNum.toFixed(3)),
            },
        });

        return NextResponse.json({
            id: row.id,
            code: row.code,
            label: row.label,
            ratePercent: Number(row.ratePercent.toString()),
        });
    } catch (e: any) {
        if (e?.code === "P2002") {
            return NextResponse.json({ error: "Esiste già un codice IVA con questo codice" }, { status: 409 });
        }
        console.error("vat-codes PUT", e);
        return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const { id: idStr } = await params;
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
            return NextResponse.json({ error: "ID non valido" }, { status: 400 });
        }

        const existing = await prisma.vatCode.findFirst({
            where: { id, companyId: ctx.companyId },
        });
        if (!existing) {
            return NextResponse.json({ error: "Codice IVA non trovato" }, { status: 404 });
        }

        await prisma.vatCode.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error("vat-codes DELETE", e);
        return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 });
    }
}

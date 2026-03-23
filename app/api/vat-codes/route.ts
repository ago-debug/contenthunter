import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { Prisma } from "@prisma/client";

function toNum(d: unknown): number {
    if (typeof d === "number" && !Number.isNaN(d)) return d;
    return parseFloat(String(d));
}

/** Lista codici IVA dell'azienda */
export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const rows = await prisma.vatCode.findMany({
            where: { companyId: ctx.companyId },
            orderBy: [{ code: "asc" }],
        });
        return NextResponse.json(
            rows.map((r) => ({
                id: r.id,
                code: r.code,
                label: r.label,
                ratePercent: toNum(r.ratePercent),
            }))
        );
    } catch (e: any) {
        console.error("vat-codes GET", e);
        return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 });
    }
}

/** Crea nuovo codice IVA (aliquota %) */
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    try {
        const body = await req.json().catch(() => ({}));
        const code = String(body.code ?? "")
            .trim()
            .toUpperCase();
        const label = body.label != null && String(body.label).trim() ? String(body.label).trim() : null;
        const rateRaw = body.ratePercent;
        const rateNum =
            typeof rateRaw === "number"
                ? rateRaw
                : parseFloat(String(rateRaw ?? "").replace(",", "."));
        if (!code) {
            return NextResponse.json({ error: "Codice IVA obbligatorio" }, { status: 400 });
        }
        if (Number.isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
            return NextResponse.json({ error: "Aliquota % deve essere tra 0 e 100" }, { status: 400 });
        }

        const row = await prisma.vatCode.create({
            data: {
                companyId: ctx.companyId,
                code,
                label,
                ratePercent: new Prisma.Decimal(rateNum.toFixed(3)),
            },
        });
        return NextResponse.json({
            id: row.id,
            code: row.code,
            label: row.label,
            ratePercent: toNum(row.ratePercent),
        });
    } catch (e: any) {
        if (e?.code === "P2002") {
            return NextResponse.json({ error: "Esiste già un codice IVA con questo codice" }, { status: 409 });
        }
        console.error("vat-codes POST", e);
        return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 });
    }
}

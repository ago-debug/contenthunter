import { Prisma } from "@prisma/client";

export type ProductLotApiRow = {
    id?: number;
    lotCode?: string;
    quantity?: string | number;
    expiryDate?: string | null;
    receivedAt?: string | null;
    notes?: string | null;
    sortOrder?: number;
};

function clampLotVarchar(v: unknown, max: number): string {
    if (v === undefined || v === null) return "";
    const s = String(v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

/** Accetta `YYYY-MM-DD` o ISO completo; restituisce mezzanotte UTC del giorno o null. */
export function parseLotDateInput(v: unknown): Date | null {
    if (v === undefined || v === null || v === "") return null;
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeLotsForDb(bodyLots: unknown): Array<{
    lotCode: string;
    quantity: Prisma.Decimal;
    expiryDate: Date | null;
    receivedAt: Date | null;
    notes: string | null;
    sortOrder: number;
}> {
    if (!Array.isArray(bodyLots)) return [];
    const out: Array<{
        lotCode: string;
        quantity: Prisma.Decimal;
        expiryDate: Date | null;
        receivedAt: Date | null;
        notes: string | null;
        sortOrder: number;
    }> = [];
    let idx = 0;
    for (const row of bodyLots) {
        if (!row || typeof row !== "object") continue;
        const r = row as ProductLotApiRow;
        const lotCode = clampLotVarchar(r.lotCode, 128);
        const q = parseFloat(String(r.quantity ?? "0").replace(",", "."));
        const quantity = Number.isFinite(q) && !Number.isNaN(q) ? q : 0;
        const notesRaw = clampLotVarchar(r.notes, 512);
        out.push({
            lotCode,
            quantity: new Prisma.Decimal(String(quantity)),
            expiryDate: parseLotDateInput(r.expiryDate),
            receivedAt: parseLotDateInput(r.receivedAt),
            notes: notesRaw ? notesRaw : null,
            sortOrder:
                typeof r.sortOrder === "number" && Number.isFinite(r.sortOrder)
                    ? Math.floor(r.sortOrder)
                    : idx,
        });
        idx++;
    }
    return out;
}

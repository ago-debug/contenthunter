import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function parsePositiveDecimal(envKey: string, defaultStr: string): Prisma.Decimal {
    const raw = (process.env[envKey] ?? defaultStr).trim();
    const d = new Prisma.Decimal(raw || defaultStr);
    if (!d.isFinite() || d.isNegative() || d.isZero()) return new Prisma.Decimal(0);
    return d;
}

/** Costo in crediti per estrazione PDF (default 0 = disattivato). */
export function getAiCreditChargePdfExtract(): Prisma.Decimal {
    return parsePositiveDecimal("AI_CREDIT_PDF_EXTRACT", "0");
}

export function getAiCreditChargePdfAsk(): Prisma.Decimal {
    return parsePositiveDecimal("AI_CREDIT_PDF_ASK", "0");
}

export function getAiCreditChargePdfSummarize(): Prisma.Decimal {
    return parsePositiveDecimal("AI_CREDIT_PDF_SUMMARIZE", "0");
}

/** Costo in crediti per mappatura multi-fonte (NotebookLM-style). Default 0 = disattivato. */
export function getAiCreditChargeNotebookMap(): Prisma.Decimal {
    return parsePositiveDecimal("AI_CREDIT_NOTEBOOK_MAP", "0");
}

export async function assertAiCreditsSufficient(
    companyId: number,
    cost: Prisma.Decimal
): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!cost.isFinite() || cost.isNegative() || cost.isZero()) return { ok: true };
    const c = await prisma.company.findUnique({
        where: { id: companyId },
        select: { aiCreditsBalance: true },
    });
    if (!c) return { ok: false, message: "Azienda non trovata." };
    if (c.aiCreditsBalance.lessThan(cost)) {
        return {
            ok: false,
            message: "Crediti AI insufficienti. Ricarica da Piattaforma & piani o contatta l'amministratore.",
        };
    }
    return { ok: true };
}

/** Addebita `amount` crediti (valore positivo = consumo). Aggiorna saldo e ledger. */
export async function applyAiCreditDebit(params: {
    companyId: number;
    userId?: number | null;
    amount: Prisma.Decimal;
    reason: string;
    meta?: Record<string, unknown> | null;
}): Promise<void> {
    const { companyId, userId, amount, reason, meta } = params;
    if (!amount.isFinite() || amount.isNegative() || amount.isZero()) return;

    const delta = amount.negated();
    const reasonClamped = reason.slice(0, 64);

    await prisma.$transaction(async (tx) => {
        const cur = await tx.company.findUnique({
            where: { id: companyId },
            select: { aiCreditsBalance: true },
        });
        if (!cur) throw new Error("company_not_found");
        const next = cur.aiCreditsBalance.add(delta);
        if (next.lessThan(0)) throw new Error("insufficient_balance");
        await tx.company.update({
            where: { id: companyId },
            data: { aiCreditsBalance: next },
        });
        await tx.aiCreditLedger.create({
            data: {
                companyId,
                userId: userId ?? null,
                delta,
                balanceAfter: next,
                reason: reasonClamped,
                meta:
                    meta === null || meta === undefined
                        ? undefined
                        : (meta as Prisma.InputJsonValue),
            },
        });
    });
}

import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

export const FREE_PLAN = "free" as const;
export const STANDARD_PLAN = "standard" as const;

export function isFreeSubscriptionPlan(plan: string | null | undefined): boolean {
    return (plan || "").toLowerCase() === FREE_PLAN;
}

export async function getCompanyPlanRow(companyId: number) {
    return prisma.company.findUnique({
        where: { id: companyId },
        select: {
            subscriptionPlan: true,
            maxProducts: true,
            maxUsers: true,
            featureSeoGeo: true,
            featurePdfSuite: true,
            onboardingStatus: true,
            aiCreditsBalance: true,
        },
    });
}

/** Limite prodotti: null = illimitato (piano standard / legacy). */
export function effectiveProductCap(row: { subscriptionPlan: string; maxProducts: number | null }): number | null {
    if (!isFreeSubscriptionPlan(row.subscriptionPlan)) return row.maxProducts ?? null;
    return row.maxProducts ?? 100;
}

export function effectiveUserCap(row: { subscriptionPlan: string; maxUsers: number | null }): number | null {
    if (!isFreeSubscriptionPlan(row.subscriptionPlan)) return row.maxUsers ?? null;
    return row.maxUsers ?? 2;
}

export async function assertCanCreateProduct(companyId: number): Promise<{ ok: true } | { ok: false; message: string }> {
    const row = await getCompanyPlanRow(companyId);
    if (!row || row.onboardingStatus !== "active") {
        return { ok: false, message: "Azienda non attiva." };
    }
    const cap = effectiveProductCap(row);
    if (cap == null) return { ok: true };
    const count = await prisma.product.count({ where: { companyId } });
    if (count >= cap) {
        return {
            ok: false,
            message: `Limite piano raggiunto: massimo ${cap} prodotti. Passa a un piano superiore o contatta il supporto.`,
        };
    }
    return { ok: true };
}

export type CompanyPlanFeatureKey = "seoGeo" | "pdfSuite";

/**
 * Moduli premium per tenant. L’admin globale bypassa (supporto).
 * Richiede azienda in stato `active` per gli utenti aziendali.
 */
export async function assertCompanyFeatureEnabled(
    companyId: number,
    feature: CompanyPlanFeatureKey,
    session: Session | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
    if (session?.user?.isGlobalAdmin) return { ok: true };
    const row = await getCompanyPlanRow(companyId);
    if (!row || row.onboardingStatus !== "active") {
        return { ok: false, message: "Azienda non attiva o workspace non approvato." };
    }
    if (feature === "seoGeo" && !row.featureSeoGeo) {
        return { ok: false, message: "Il modulo SEO & GEO non è incluso nel piano corrente." };
    }
    if (feature === "pdfSuite" && !row.featurePdfSuite) {
        return { ok: false, message: "PDF AI Studio non è incluso nel piano corrente." };
    }
    return { ok: true };
}

export async function assertCanAddUser(companyId: number): Promise<{ ok: true } | { ok: false; message: string }> {
    const row = await getCompanyPlanRow(companyId);
    if (!row) return { ok: false, message: "Azienda non trovata." };
    const cap = effectiveUserCap(row);
    if (cap == null) return { ok: true };
    const count = await prisma.user.count({ where: { companyId } });
    if (count >= cap) {
        return {
            ok: false,
            message: `Limite utenti raggiunto: massimo ${cap} per il piano corrente.`,
        };
    }
    return { ok: true };
}

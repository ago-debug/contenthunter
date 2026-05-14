import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { getCompanyPlanRow } from "@/lib/plan-limits";

/** Flag piano tenant per UI (sidebar) e controlli client. */
export async function GET(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }

    const row = await getCompanyPlanRow(ctx.companyId);
    if (!row) {
        return NextResponse.json({ error: "Azienda non trovata" }, { status: 404 });
    }

    return NextResponse.json({
        companyId: ctx.companyId,
        subscriptionPlan: row.subscriptionPlan,
        onboardingStatus: row.onboardingStatus,
        featureSeoGeo: row.featureSeoGeo,
        featurePdfSuite: row.featurePdfSuite,
    });
}

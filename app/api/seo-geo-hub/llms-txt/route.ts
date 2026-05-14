import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { sanitizeSeoGeoHubInput } from "@/lib/seo-geo-hub-schema";
import { buildLlmsTxtDocument } from "@/lib/llms-txt-builder";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const gate = await assertCompanyFeatureEnabled(ctx.companyId, "seoGeo", ctx.session);
    if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    const row = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { name: true, seoGeoHub: true, wooDomain: true },
    });
    if (!row) {
        return NextResponse.json({ error: "Azienda non trovata" }, { status: 404 });
    }

    const hub = sanitizeSeoGeoHubInput(row.seoGeoHub);
    const productCount = await prisma.product.count({ where: { companyId: ctx.companyId } });

    const body = buildLlmsTxtDocument({
        companyName: row.name,
        hub,
        productCount,
        wooDomain: row.wooDomain,
    });

    return new NextResponse(body, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "private, no-store",
        },
    });
}

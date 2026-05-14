import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { sanitizeSeoGeoHubInput } from "@/lib/seo-geo-hub-schema";
import { runTechnicalSiteAudit } from "@/lib/technical-site-audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const gate = await assertCompanyFeatureEnabled(ctx.companyId, "seoGeo", ctx.session);
    if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    let body: { siteUrl?: unknown };
    try {
        body = (await req.json()) as { siteUrl?: unknown };
    } catch {
        body = {};
    }

    const row = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: {
            wooDomain: true,
            prestaShopUrl: true,
            seoGeoHub: true,
        },
    });

    const hub = sanitizeSeoGeoHubInput(row?.seoGeoHub);
    const configuredSitemap = hub.indexing?.sitemapUrl?.trim() || null;

    const fromBody = typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
    const fromWoo = row?.wooDomain?.trim() || "";
    const fromPresta = row?.prestaShopUrl?.trim() || "";
    const siteInput = fromBody || fromWoo || fromPresta;

    if (!siteInput) {
        return NextResponse.json(
            {
                error:
                    "Nessun URL negozio: imposta Woo o Presta in Impostazioni, oppure incolla l’URL del sito nell’analisi.",
            },
            { status: 400 }
        );
    }

    const result = await runTechnicalSiteAudit(siteInput, { configuredSitemapUrl: configuredSitemap });
    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ audit: result });
}

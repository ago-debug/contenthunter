import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { sanitizeSeoGeoHubInput } from "@/lib/seo-geo-hub-schema";
import { runVisibilityScan } from "@/lib/seo-visibility-scan";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const gate = await assertCompanyFeatureEnabled(ctx.companyId, "seoGeo", ctx.session);
    if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    let body: { siteUrl?: unknown; keywords?: unknown; gl?: unknown; hl?: unknown };
    try {
        body = (await req.json()) as typeof body;
    } catch {
        body = {};
    }

    const row = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { wooDomain: true, prestaShopUrl: true, seoGeoHub: true },
    });

    const hub = sanitizeSeoGeoHubInput(row?.seoGeoHub);
    const fromBody = typeof body.siteUrl === "string" ? body.siteUrl.trim() : "";
    const fromWoo = row?.wooDomain?.trim() || "";
    const fromPresta = row?.prestaShopUrl?.trim() || "";
    const siteInput = fromBody || fromWoo || fromPresta;

    if (!siteInput) {
        return NextResponse.json(
            {
                error:
                    "Nessun URL negozio: imposta Woo o Presta in Impostazioni, oppure incolla l’URL nell’analisi visibilità.",
            },
            { status: 400 }
        );
    }

    const keys = await resolveIntegrationKeys(ctx.companyId);
    const keywordsOverride = typeof body.keywords === "string" ? body.keywords : "";
    const keywordsText =
        keywordsOverride.trim() ||
        (typeof hub.seo.primaryKeywords === "string" ? hub.seo.primaryKeywords : "") ||
        "";

    const gl = typeof body.gl === "string" ? body.gl : "it";
    const hl = typeof body.hl === "string" ? body.hl : "it";

    const result = await runVisibilityScan({
        siteInput,
        keywordsText,
        serpApiKey: keys.serpapi,
        gl,
        hl,
    });

    if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ snapshot: result });
}

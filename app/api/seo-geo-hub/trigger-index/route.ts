import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import { sanitizeSeoGeoHubInput } from "@/lib/seo-geo-hub-schema";
import { pingSitemapToSearchEngines, submitIndexNow } from "@/lib/search-indexing";

export const runtime = "nodejs";

/**
 * Invio manuale: ping sitemap e/o IndexNow con URL passati nel body.
 */
export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const gate = await assertCompanyFeatureEnabled(ctx.companyId, "seoGeo", ctx.session);
    if (!gate.ok) {
        return NextResponse.json({ error: gate.message }, { status: 403 });
    }

    let body: { urls?: unknown; pingSitemapOnly?: unknown };
    try {
        body = (await req.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
    }

    const row = await prisma.company.findUnique({
        where: { id: ctx.companyId },
        select: { seoGeoHub: true },
    });
    const hub = sanitizeSeoGeoHubInput(row?.seoGeoHub);
    const ix = hub.indexing;

    const urls = Array.isArray(body.urls)
        ? (body.urls as unknown[])
              .map((u) => String(u).trim())
              .filter((u) => /^https?:\/\//i.test(u))
              .slice(0, 100)
        : [];

    const pingOnly = body.pingSitemapOnly === true;
    const results: Record<string, unknown> = {};

    try {
        if (ix?.sitemapUrl?.trim()) {
            await pingSitemapToSearchEngines(ix.sitemapUrl.trim());
            results.sitemapPing = "ok";
        } else {
            results.sitemapPing = "skipped (nessun URL sitemap configurato)";
        }
    } catch (e) {
        results.sitemapPing = String(e instanceof Error ? e.message : e);
    }

    if (!pingOnly && urls.length > 0 && ix?.indexNowEnabled && ix.indexNowKey && ix.indexNowHost) {
        try {
            const r = await submitIndexNow({
                host: ix.indexNowHost,
                key: ix.indexNowKey,
                keyLocation: ix.indexNowKeyLocation?.trim() || undefined,
                urlList: urls,
            });
            results.indexNow = r;
        } catch (e) {
            results.indexNow = { ok: false, error: String(e instanceof Error ? e.message : e) };
        }
    } else if (!pingOnly) {
        results.indexNow =
            urls.length === 0
                ? "skipped (nessun URL nel body)"
                : "skipped (IndexNow non configurato o disattivato)";
    }

    return NextResponse.json({ ok: true, results });
}

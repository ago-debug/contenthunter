import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { assertCompanyFeatureEnabled } from "@/lib/plan-limits";
import {
    defaultSeoGeoHubPayload,
    sanitizeSeoGeoHubInput,
    type SeoGeoHubPayload,
} from "@/lib/seo-geo-hub-schema";

export const runtime = "nodejs";

function parseHub(raw: unknown): SeoGeoHubPayload {
    if (raw == null) return defaultSeoGeoHubPayload();
    return sanitizeSeoGeoHubInput(raw);
}

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
        select: { seoGeoHub: true, wooDomain: true, prestaShopUrl: true },
    });

    const hub = parseHub(row?.seoGeoHub);
    return NextResponse.json({
        hub,
        wooDomain: row?.wooDomain?.trim() || null,
        prestaShopUrl: row?.prestaShopUrl?.trim() || null,
    });
}

export async function PUT(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const gatePut = await assertCompanyFeatureEnabled(ctx.companyId, "seoGeo", ctx.session);
    if (!gatePut.ok) {
        return NextResponse.json({ error: gatePut.message }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
    }

    const hub = sanitizeSeoGeoHubInput(
        body && typeof body === "object" && "hub" in (body as object)
            ? (body as { hub?: unknown }).hub
            : body
    );

    await prisma.company.update({
        where: { id: ctx.companyId },
        data: { seoGeoHub: hub as object },
    });

    return NextResponse.json({ hub, saved: true });
}

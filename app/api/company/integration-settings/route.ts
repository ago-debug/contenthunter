import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { normalizeGeminiApiKey } from "@/lib/gemini-api-key";

export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const c = await prisma.company.findUnique({
            where: { id: companyId },
            select: {
                name: true,
                openaiApiKey: true,
                serpapiKey: true,
                geminiApiKey: true,
                wooDomain: true,
                wooConsumerKey: true,
                wooConsumerSecret: true,
                prestaShopUrl: true,
                prestaShopApiKey: true,
                prestaShopDefaultCategoryId: true,
                prestaShopLanguageId: true,
                prestaShopIdShop: true,
                prestaShopTaxRulesGroupId: true,
                shopperEmbedToken: true,
            },
        });
        if (!c) {
            return NextResponse.json({ error: "Azienda non trovata" }, { status: 404 });
        }

        return NextResponse.json({
            companyId,
            companyName: c.name,
            hasOpenaiKey: !!(c.openaiApiKey && c.openaiApiKey.trim()),
            hasSerpapiKey: !!(c.serpapiKey && c.serpapiKey.trim()),
            hasGeminiKey: !!(c.geminiApiKey && c.geminiApiKey.trim()),
            wooDomain: c.wooDomain ?? "",
            wooConsumerKey: c.wooConsumerKey ?? "",
            wooConsumerSecret: c.wooConsumerSecret ?? "",
            prestaShopUrl: c.prestaShopUrl ?? "",
            prestaShopApiKey: c.prestaShopApiKey ?? "",
            prestaShopDefaultCategoryId: c.prestaShopDefaultCategoryId ?? null,
            prestaShopLanguageId: c.prestaShopLanguageId ?? null,
            prestaShopIdShop: c.prestaShopIdShop ?? null,
            prestaShopTaxRulesGroupId: c.prestaShopTaxRulesGroupId ?? null,
            hasShopperEmbedToken: !!(c.shopperEmbedToken && String(c.shopperEmbedToken).trim()),
        });
    } catch (e: any) {
        console.error("[integration-settings GET]", e);
        return NextResponse.json({ error: "Errore lettura impostazioni" }, { status: 500 });
    }
}

type PatchBody = {
    openaiKey?: string | null;
    serpapiKey?: string | null;
    geminiKey?: string | null;
    wooDomain?: string | null;
    wooConsumerKey?: string | null;
    wooConsumerSecret?: string | null;
    prestaShopUrl?: string | null;
    prestaShopApiKey?: string | null;
    prestaShopDefaultCategoryId?: number | null;
    prestaShopLanguageId?: number | null;
    prestaShopIdShop?: number | null;
    prestaShopTaxRulesGroupId?: number | null;
};

function applySecretPatch(
    body: PatchBody,
    key: keyof PatchBody,
    data: Prisma.CompanyUpdateInput,
    col: "openaiApiKey" | "serpapiKey" | "geminiApiKey"
) {
    if (!(key in body) || body[key] === undefined) return;
    const v = body[key];
    if (v === null) {
        data[col] = null;
        return;
    }
    const s = String(v).trim();
    if (s === "") return;
    data[col] = col === "geminiApiKey" ? normalizeGeminiApiKey(s) || s : s;
}

function applyWooPatch(
    body: PatchBody,
    key: keyof PatchBody,
    data: Prisma.CompanyUpdateInput,
    col: "wooDomain" | "wooConsumerKey" | "wooConsumerSecret" | "prestaShopUrl" | "prestaShopApiKey"
) {
    if (!(key in body) || body[key] === undefined) return;
    const v = body[key];
    if (v === null) {
        data[col] = null;
        return;
    }
    const s = String(v).trim();
    data[col] = s === "" ? null : s;
}

function applyPrestaIntPatch(
    body: PatchBody,
    key:
        | "prestaShopDefaultCategoryId"
        | "prestaShopLanguageId"
        | "prestaShopIdShop"
        | "prestaShopTaxRulesGroupId",
    data: Prisma.CompanyUpdateInput
) {
    if (!(key in body) || body[key] === undefined) return;
    const v = body[key];
    if (v === null) {
        data[key] = null;
        return;
    }
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (Number.isNaN(n) || n <= 0) {
        data[key] = null;
        return;
    }
    data[key] = n;
}

export async function PATCH(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    let body: PatchBody;
    try {
        body = (await req.json()) as PatchBody;
    } catch {
        return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const data: Prisma.CompanyUpdateInput = {};

    applySecretPatch(body, "openaiKey", data, "openaiApiKey");
    applySecretPatch(body, "serpapiKey", data, "serpapiKey");
    applySecretPatch(body, "geminiKey", data, "geminiApiKey");
    applyWooPatch(body, "wooDomain", data, "wooDomain");
    applyWooPatch(body, "wooConsumerKey", data, "wooConsumerKey");
    applyWooPatch(body, "wooConsumerSecret", data, "wooConsumerSecret");
    applyWooPatch(body, "prestaShopUrl", data, "prestaShopUrl");
    applyWooPatch(body, "prestaShopApiKey", data, "prestaShopApiKey");
    applyPrestaIntPatch(body, "prestaShopDefaultCategoryId", data);
    applyPrestaIntPatch(body, "prestaShopLanguageId", data);
    applyPrestaIntPatch(body, "prestaShopIdShop", data);
    applyPrestaIntPatch(body, "prestaShopTaxRulesGroupId", data);

    if (Object.keys(data).length === 0) {
        return NextResponse.json({ ok: true, message: "Nessun campo da aggiornare" });
    }

    try {
        await prisma.company.update({
            where: { id: companyId },
            data,
        });
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        console.error("[integration-settings PATCH]", e);
        return NextResponse.json({ error: "Errore salvataggio impostazioni" }, { status: 500 });
    }
}

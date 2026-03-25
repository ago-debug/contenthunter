import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

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
};

function applySecretPatch(
    body: PatchBody,
    key: keyof PatchBody,
    data: Record<string, string | null>,
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
    data[col] = s;
}

function applyWooPatch(
    body: PatchBody,
    key: keyof PatchBody,
    data: Record<string, string | null>,
    col: "wooDomain" | "wooConsumerKey" | "wooConsumerSecret"
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

    const data: Record<string, string | null> = {};

    applySecretPatch(body, "openaiKey", data, "openaiApiKey");
    applySecretPatch(body, "serpapiKey", data, "serpapiKey");
    applySecretPatch(body, "geminiKey", data, "geminiApiKey");
    applyWooPatch(body, "wooDomain", data, "wooDomain");
    applyWooPatch(body, "wooConsumerKey", data, "wooConsumerKey");
    applyWooPatch(body, "wooConsumerSecret", data, "wooConsumerSecret");

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

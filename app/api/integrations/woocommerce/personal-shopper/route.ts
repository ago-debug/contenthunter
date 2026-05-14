import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { CONTENT_AI_KEY_MISSING_MESSAGE } from "@/lib/ai-content-provider";
import { executePersonalShopperForCompany, type ShopperHistoryTurn } from "@/lib/woo-personal-shopper";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const { companyId } = ctx;

        let body: { message?: string; history?: ShopperHistoryTurn[] };
        try {
            body = (await req.json()) as { message?: string; history?: ShopperHistoryTurn[] };
        } catch {
            return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
        }

        const message = String(body.message ?? "").trim();
        if (!message) {
            return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
        }
        if (message.length > 8000) {
            return NextResponse.json({ error: "Messaggio troppo lungo (max 8000 caratteri)" }, { status: 400 });
        }

        const history = Array.isArray(body.history) ? body.history : [];
        const result = await executePersonalShopperForCompany(companyId, {
            message,
            history,
            visitorMode: false,
        });

        return NextResponse.json(result);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Errore personal shopper";
        console.error("[woo personal-shopper]", err);
        const status = msg === CONTENT_AI_KEY_MISSING_MESSAGE ? 503 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

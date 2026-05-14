import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    executePersonalShopperForCompany,
    type ShopperHistoryTurn,
} from "@/lib/woo-personal-shopper";

export const runtime = "nodejs";
export const maxDuration = 120;

function normalizeToken(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const t = raw.trim();
    return t.length >= 16 ? t : null;
}

export async function POST(req: Request) {
    try {
        let body: {
            token?: string;
            message?: string;
            history?: ShopperHistoryTurn[];
        };
        try {
            body = (await req.json()) as typeof body;
        } catch {
            return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
        }

        const authHeader = req.headers.get("authorization");
        const bearer =
            authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

        const token =
            normalizeToken(body.token) ||
            normalizeToken(bearer);

        if (!token) {
            return NextResponse.json(
                { error: "Token mancante: usa body { token } o Authorization: Bearer …" },
                { status: 401 }
            );
        }

        const row = await prisma.company.findUnique({
            where: { shopperEmbedToken: token },
            select: { id: true },
        });
        if (!row) {
            return NextResponse.json({ error: "Token non valido" }, { status: 401 });
        }

        const message = String(body.message ?? "").trim();
        if (!message) {
            return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
        }
        if (message.length > 8000) {
            return NextResponse.json({ error: "Messaggio troppo lungo (max 8000 caratteri)" }, { status: 400 });
        }

        const history = Array.isArray(body.history) ? body.history : [];

        const result = await executePersonalShopperForCompany(row.id, {
            message,
            history,
            visitorMode: true,
        });

        return NextResponse.json({
            ...result,
            wooDomain: result.wooDomain,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Errore personal shopper";
        console.error("[public woo-personal-shopper]", err);
        const status = msg.includes("Chiave AI") || msg.includes("mancante") ? 503 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

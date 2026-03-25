import { NextResponse } from "next/server";
import axios from "axios";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type SerpOrganic = { title?: string; snippet?: string; link?: string };
type SerpShopping = { title?: string; source?: string; snippet?: string; product_link?: string; link?: string };

async function serpGoogleSearch(args: { apiKey: string; q: string; gl: string; hl: string; num: number }) {
    const resp = await axios.get("https://serpapi.com/search.json", {
        timeout: 18000,
        params: {
            engine: "google",
            api_key: args.apiKey,
            q: args.q,
            gl: args.gl,
            hl: args.hl,
            num: args.num,
        },
    });
    return resp.data as any;
}

async function serpGoogleShoppingSearch(args: { apiKey: string; q: string; gl: string; hl: string; num: number }) {
    const resp = await axios.get("https://serpapi.com/search.json", {
        timeout: 18000,
        params: {
            engine: "google_shopping",
            api_key: args.apiKey,
            q: args.q,
            gl: args.gl,
            hl: args.hl,
            num: args.num,
        },
    });
    return resp.data as any;
}

function collectWebContext(data: any): string[] {
    const lines: string[] = [];
    const organic: SerpOrganic[] = Array.isArray(data?.organic_results) ? data.organic_results : [];
    for (const o of organic.slice(0, 10)) {
        if (o.title) lines.push(`Risultato: ${o.title}`);
        if (o.snippet) lines.push(`Estratto: ${o.snippet}`);
    }
    const shop: SerpShopping[] = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
    for (const s of shop.slice(0, 8)) {
        if (s.title) lines.push(`Shopping: ${s.title}${s.source ? ` (${s.source})` : ""}`);
    }
    return lines.slice(0, 40);
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const sku = String(body.sku ?? "").trim();
        const ean = String(body.ean ?? "").trim();
        const brandStr = String(body.brand ?? "").trim();
        const producerName = String(body.producerName ?? body.brand ?? "").trim();
        const brandId = body.brandId != null ? Number(body.brandId) : null;
        const language = String(body.language ?? "it").slice(0, 5) || "it";

        if (!sku && !ean) {
            return NextResponse.json({ error: "Indica almeno SKU o EAN." }, { status: 400 });
        }

        let brandGuidelines = "";
        let producerLabel = producerName || brandStr;
        let producerDomain: string | null = null;

        if (brandId && Number.isFinite(brandId)) {
            const b = await prisma.brand.findFirst({ where: { id: brandId } });
            if (b) {
                producerLabel = producerLabel || b.name;
                producerDomain = b.producerDomain || null;
                if (b.aiContentGuidelines) {
                    brandGuidelines = `

Linee guida brand "${b.name}" (tono titolo):
${b.aiContentGuidelines}
`;
                }
            }
        }

        const serpKey = process.env.SERPAPI_KEY || process.env.SERPAPI || "";
        const webLines: string[] = [];

        if (serpKey) {
            const queries: string[] = [];
            const core = [producerLabel, ean || sku].filter(Boolean).join(" ").trim();
            if (core) queries.push(core);
            if (producerLabel && ean) queries.push(`${producerLabel} ${ean}`);
            if (producerLabel && sku) queries.push(`${producerLabel} ${sku}`);
            if (producerDomain) {
                try {
                    const host = new URL(
                        producerDomain.includes("://") ? producerDomain : `https://${producerDomain}`
                    ).hostname.replace(/^www\./i, "");
                    if (ean) queries.push(`${ean} site:${host}`);
                    else if (sku) queries.push(`${sku} site:${host}`);
                } catch {
                    /* ignore */
                }
            }

            const seen = new Set<string>();
            for (const q of queries) {
                if (!q || seen.has(q)) continue;
                seen.add(q);
                try {
                    const data = await serpGoogleSearch({
                        apiKey: serpKey,
                        q,
                        gl: "it",
                        hl: language,
                        num: 10,
                    });
                    webLines.push(...collectWebContext(data));
                } catch (e) {
                    console.warn("suggest-product-title google search:", q, e);
                }
                if (webLines.length >= 35) break;
            }

            if (webLines.length < 8) {
                for (const q of queries.slice(0, 2)) {
                    if (!q) continue;
                    try {
                        const data = await serpGoogleShoppingSearch({
                            apiKey: serpKey,
                            q,
                            gl: "it",
                            hl: language,
                            num: 12,
                        });
                        const items = Array.isArray(data?.shopping_results) ? data.shopping_results : [];
                        for (const it of items.slice(0, 10)) {
                            const t = (it as SerpShopping)?.title;
                            if (t) webLines.push(`Google Shopping: ${t}`);
                        }
                    } catch (e) {
                        console.warn("suggest-product-title shopping:", e);
                    }
                }
            }
        }

        const webContext =
            webLines.length > 0
                ? `MATERIALE DA RICERCA WEB (usa come riferimento; non copiare alla lettera se incoerente):\n${webLines
                      .filter(Boolean)
                      .slice(0, 45)
                      .join("\n")}`
                : "Nessun risultato web automatico (configura SERPAPI_KEY sul server per abilitare la ricerca).";

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                {
                    error: "OPENAI_API_KEY mancante sul server.",
                    details: "Servono chiavi SerpAPI (opzionale) e OpenAI per generare il titolo.",
                },
                { status: 500 }
            );
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const prompt = `Sei un catalog manager B2B. Genera UN SOLO titolo prodotto in ${language}, chiaro e professionale, adatto a scheda ERP/PIM.
${brandGuidelines}

DATI CERTI (non inventare codici diversi):
- SKU: ${sku || "—"}
- EAN: ${ean || "—"}
- Brand / produttore (nome da usare se pertinente): ${producerLabel || "—"}

${webContext}

REGOLE:
1) Il titolo deve essere una sola riga, max circa 120 caratteri.
2) Includi il nome brand/produttore se ha senso commerciale (es. all'inizio o dopo il tipo prodotto).
3) Se il materiale web è contraddittorio o generico, privilegia SKU/EAN e un titolo tecnico sobrio.
4) Non usare slogan, emoji, "Scopri", "Offerta", prezzi o garanzie inventate.
5) Rispondi SOLO con JSON valido: {"title":"..."}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "Rispondi solo con un oggetto JSON con chiave title (stringa). Nessun testo fuori dal JSON.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.35,
            max_tokens: 200,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices?.[0]?.message?.content || "{}";
        let title = "";
        try {
            const parsed = JSON.parse(raw) as { title?: string };
            title = String(parsed.title ?? "").trim();
        } catch {
            title = raw.replace(/^\s*[\[{]|"title"\s*:\s*"|"\s*}\]\s*$/g, "").trim();
        }

        if (!title) {
            return NextResponse.json({ error: "Il modello non ha restituito un titolo valido." }, { status: 502 });
        }

        return NextResponse.json({
            title,
            meta: {
                webHintsLines: webLines.length,
                serpConfigured: Boolean(serpKey),
                language,
            },
        });
    } catch (err: any) {
        console.error("suggest-product-title:", err);
        return NextResponse.json(
            { error: err?.message || "Errore generazione titolo" },
            { status: 500 }
        );
    }
}

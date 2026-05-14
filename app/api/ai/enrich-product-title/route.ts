import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { CONTENT_AI_KEY_MISSING_MESSAGE, runJsonChatCompletion } from "@/lib/ai-content-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
    language?: string;
    currentTitle?: string;
    bulletPoints?: string;
    description?: string;
    docDescription?: string;
    dimensions?: string;
    weight?: string;
    material?: string;
    brand?: string;
    category?: string;
    extraFields?: Record<string, unknown>;
};

function previewExtra(extra: Record<string, unknown> | undefined, maxChars: number): string {
    if (!extra || typeof extra !== "object") return "";
    try {
        const entries = Object.entries(extra)
            .filter(([, v]) => v != null && String(v).trim() !== "")
            .map(([k, v]) => `${k}: ${String(v)}`);
        const s = entries.join("\n");
        return s.length > maxChars ? `${s.slice(0, maxChars)}\n…` : s;
    } catch {
        return "";
    }
}

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const keys = await resolveIntegrationKeys(ctx.companyId);
        if (!keys.gemini && !keys.openai) {
            return NextResponse.json(
                { error: "Chiave AI mancante.", details: CONTENT_AI_KEY_MISSING_MESSAGE },
                { status: 500 }
            );
        }

        let body: Body;
        try {
            body = (await req.json()) as Body;
        } catch {
            return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
        }

        const language = String(body.language ?? "it").slice(0, 8) || "it";
        const currentTitle = String(body.currentTitle ?? "").trim();
        const bulletPoints = String(body.bulletPoints ?? "").trim();
        const description = String(body.description ?? "").trim().slice(0, 2400);
        const docDescription = String(body.docDescription ?? "").trim().slice(0, 2400);
        const dimensions = String(body.dimensions ?? "").trim();
        const weight = String(body.weight ?? "").trim();
        const material = String(body.material ?? "").trim();
        const brand = String(body.brand ?? "").trim();
        const category = String(body.category ?? "").trim();
        const extraPreview = previewExtra(body.extraFields, 1000);

        if (!currentTitle && !bulletPoints && !description && !docDescription && !dimensions && !weight && !material && !extraPreview) {
            return NextResponse.json(
                { error: "Servono almeno titolo attuale o contenuti (bullet, descrizione, misure, extra) da integrare." },
                { status: 400 }
            );
        }

        const prompt = `Sei un editor catalogo B2B. Arricchisci il TITOLO prodotto in lingua "${language}" usando SOLO informazioni presenti nei dati sotto.
Obiettivo: aggiungere in modo compatto al titolo elementi utili già attestati (es. misure, peso, materiale, colore, varianti) che spesso sono nei bullet o negli extra, senza duplicare inutilmente il brand se è già all'inizio.

Titolo attuale (base, puoi modificarlo se serve coerenza):
${currentTitle || "—"}

Bullet (una riga = un punto, possono contenere "Colore:", "Dimensioni:", ecc.):
${bulletPoints || "—"}

Descrizione commerciale / lunga (estratto):
${description ? description.slice(0, 1200) : "—"}

Descrizione tecnica / da PDF (estratto):
${docDescription ? docDescription.slice(0, 1200) : "—"}

Campi strutturati se presenti:
- Dimensioni: ${dimensions || "—"}
- Peso: ${weight || "—"}
- Materiale: ${material || "—"}
- Brand: ${brand || "—"}
- Categoria: ${category || "—"}

Altri attributi (chiave: valore):
${extraPreview || "—"}

REGOLE:
1) Una sola riga titolo, massimo circa 140 caratteri.
2) NON inventare colori, misure o materiali se non compaiono chiaramente nei dati.
3) Stile sobrio, niente slogan, emoji, prezzi o garanzie.
4) Rispondi SOLO con JSON: {"title":"..."}`;

        const raw = await runJsonChatCompletion(
            { openai: keys.openai, gemini: keys.gemini },
            {
                system: 'Rispondi solo con JSON {"title":"stringa"}. Nessun testo fuori dal JSON.',
                user: prompt,
                maxTokens: 96,
                temperature: 0.25,
            }
        );

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

        return NextResponse.json({ title });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Errore arricchimento titolo";
        console.error("enrich-product-title:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

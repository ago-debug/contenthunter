import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { getOpenAiChatModelForProductCopy } from "@/lib/ai-product-copy";
import { createOpenAiCompatibleClient } from "@/lib/openai-compatible-client";

const TRANSLATE_PROMPT_MAX_CHARS = 10000;

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const keys = await resolveIntegrationKeys(ctx.companyId);

        const body = await req.json();
        const { textData, targetLanguage = "en" } = body;

        if (!textData || typeof textData !== "object") {
            return NextResponse.json({ error: "Dati di testo non forniti correttamente" }, { status: 400 });
        }

        const payload = JSON.stringify(textData, null, 2);
        const payloadCapped =
            payload.length > TRANSLATE_PROMPT_MAX_CHARS
                ? `${payload.slice(0, TRANSLATE_PROMPT_MAX_CHARS)}\n…[troncato per limite lunghezza]`
                : payload;

        const prompt = `
Sei un traduttore ed editor esperto di e-commerce e PIM. Il tuo compito è tradurre, correggere o riallineare i seguenti campi nella lingua target: "${targetLanguage}".
Se il testo è già nella lingua corretta ma è disallineato, sgrammaticato o contiene residui di altre lingue dovuti a un'importazione CSV errata, devi correggerlo e modellarlo in modo professionale e tecnico.

REGOLE TASSATIVE:
1. Devi ESPLICITAMENTE tradurre/correggere i "Titoli" ('title') esattamente come tutti gli altri elementi.
2. Rispetta e mantieni i bullet point come elenco se presenti.
3. Non tradurre SKU, EAN o codici tecnici.
4. Se un campo è vuoto, restituisci una stringa vuota.

CAMPI DA TRADURRE (JSON):
${payloadCapped}

RESTITUISCI SOLO IL JSON TRADOTTO, SENZA COMMENTI O INTRODUZIONI. IL FORMATO DEVE ESSERE IDENTICO ALL'INPUT.
`;

        if (!keys.openai) {
            return NextResponse.json(
                { error: "API Key mancante: configura OpenAI in Impostazioni azienda o sul server." },
                { status: 500 }
            );
        }

        const openai = createOpenAiCompatibleClient(keys.openai);

        const completion = await openai.chat.completions.create({
            model: getOpenAiChatModelForProductCopy(),
            messages: [
                { role: "system", content: "Sei un traduttore JSON professionale. Rispondi solo con il codice JSON." },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 2500,
            response_format: { type: "json_object" },
        });

        const translatedData = JSON.parse(completion.choices[0]?.message?.content || "{}");

        return NextResponse.json(translatedData);

    } catch (err: any) {
        console.error("AI TRANSLATE FAILURE:", err);
        return NextResponse.json({ error: "Errore durante la traduzione AI", details: err.message }, { status: 500 });
    }
}

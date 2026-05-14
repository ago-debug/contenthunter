import { NextResponse } from "next/server";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { getTranslateMaxOutputTokens } from "@/lib/ai-cost-config";
import { CONTENT_AI_KEY_MISSING_MESSAGE, runJsonChatCompletion } from "@/lib/ai-content-provider";

const TRANSLATE_PROMPT_MAX_CHARS = 10000;

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const keys = await resolveIntegrationKeys(ctx.companyId);

        const body = await req.json();
        const { textData, targetLanguage = "en", preserveTitleContext } = body;

        if (!textData || typeof textData !== "object") {
            return NextResponse.json({ error: "Dati di testo non forniti correttamente" }, { status: 400 });
        }

        const payload = JSON.stringify(textData, null, 2);
        const payloadCapped =
            payload.length > TRANSLATE_PROMPT_MAX_CHARS
                ? `${payload.slice(0, TRANSLATE_PROMPT_MAX_CHARS)}\n…[troncato per limite lunghezza]`
                : payload;

        const hasTitleField =
            Object.prototype.hasOwnProperty.call(textData, "title") &&
            typeof (textData as Record<string, unknown>).title === "string";
        const brandHint =
            preserveTitleContext &&
            typeof preserveTitleContext === "object" &&
            typeof (preserveTitleContext as { brand?: unknown }).brand === "string"
                ? String((preserveTitleContext as { brand: string }).brand).trim()
                : "";

        const titleSpecificRules =
            hasTitleField && preserveTitleContext != null && typeof preserveTitleContext === "object"
                ? `
REGOLE AGGIUNTIVE OBBLIGATORIE PER IL CAMPO "title":
- Non tradurre né declinare il nome del brand${brandHint ? ` (usa esattamente questa forma se compare: "${brandHint}")` : " se compare nel titolo"}: lascialo identico al sorgente.
- Conserva invariati i nomi propri commerciali, nomi di linea, collezione o modello già presenti nel titolo sorgente.
- Traduci solo le parti descrittive generiche (es. materiale, colore, tipologia prodotto, aggettivi), non i nomi propri.
`
                : "";

        const prompt = `
Sei un traduttore ed editor esperto di e-commerce e cataloghi prodotti. Il tuo compito è tradurre, correggere o riallineare i seguenti campi nella lingua target: "${targetLanguage}".
Se il testo è già nella lingua corretta ma è disallineato, sgrammaticato o contiene residui di altre lingue dovuti a un'importazione CSV errata, devi correggerlo e modellarlo in modo professionale e tecnico.

REGOLE TASSATIVE:
1. Devi tradurre/correggere ogni campo presente nel JSON in input nella lingua target.${titleSpecificRules ? ` Per "title" applica anche le regole aggiuntive sotto.` : ` Per i "Titoli" ('title') applica le stesse regole degli altri campi.`}
2. Rispetta e mantieni i bullet point come elenco se presenti.
3. Non tradurre SKU, EAN o codici tecnici.
4. Se un campo è vuoto, restituisci una stringa vuota.
${titleSpecificRules}

CAMPI DA TRADURRE (JSON):
${payloadCapped}

RESTITUISCI SOLO IL JSON TRADOTTO, SENZA COMMENTI O INTRODUZIONI. IL FORMATO DEVE ESSERE IDENTICO ALL'INPUT.
`;

        if (!keys.gemini && !keys.openai) {
            return NextResponse.json({ error: CONTENT_AI_KEY_MISSING_MESSAGE }, { status: 500 });
        }

        const raw = await runJsonChatCompletion(
            { openai: keys.openai, gemini: keys.gemini },
            {
                system: "Sei un traduttore JSON professionale. Rispondi solo con il codice JSON.",
                user: prompt,
                maxTokens: getTranslateMaxOutputTokens(),
                temperature: 0.3,
            }
        );

        const translatedData = JSON.parse(raw || "{}");

        return NextResponse.json(translatedData);

    } catch (err: any) {
        console.error("AI TRANSLATE FAILURE:", err);
        return NextResponse.json({ error: "Errore durante la traduzione AI", details: err.message }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { textData, targetLanguage = "en" } = body;

        if (!textData || typeof textData !== "object") {
            return NextResponse.json({ error: "Dati di testo non forniti correttamente" }, { status: 400 });
        }

        const prompt = `
Sei un traduttore ed editor esperto di e-commerce e PIM. Il tuo compito è tradurre, correggere o riallineare i seguenti campi nella lingua target: "${targetLanguage}".
Se il testo è già nella lingua corretta ma è disallineato, sgrammaticato o contiene residui di altre lingue dovuti a un'importazione CSV errata, devi correggerlo e modellarlo in modo professionale e tecnico.

REGOLE TASSATIVE:
1. Devi ESPLICITAMENTE tradurre/correggere i "Titoli" ('title') esattamente come tutti gli altri elementi.
2. Rispetta e mantieni i bullet point come elenco se presenti.
3. Non tradurre SKU, EAN o codici tecnici.
4. Se un campo è vuoto, restituisci una stringa vuota.

CAMPI DA TRADURRE (JSON):
${JSON.stringify(textData, null, 2)}

RESTITUISCI SOLO IL JSON TRADOTTO, SENZA COMMENTI O INTRODUZIONI. IL FORMATO DEVE ESSERE IDENTICO ALL'INPUT.
`;

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "API Key mancante sul server." }, { status: 500 });
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Sei un traduttore JSON professionale. Rispondi solo con il codice JSON." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const translatedData = JSON.parse(completion.choices[0]?.message?.content || "{}");

        return NextResponse.json(translatedData);

    } catch (err: any) {
        console.error("AI TRANSLATE FAILURE:", err);
        return NextResponse.json({ error: "Errore durante la traduzione AI", details: err.message }, { status: 500 });
    }
}

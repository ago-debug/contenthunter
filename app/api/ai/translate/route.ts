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
Sei un traduttore esperto di e-commerce e PIM. Traduci i seguenti campi nella lingua: ${targetLanguage}.
Mantieni lo stile professionale e tecnico. Non tradurre SKU o codici tecnici.
Se un campo è vuoto, restituisci una stringa vuota.

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

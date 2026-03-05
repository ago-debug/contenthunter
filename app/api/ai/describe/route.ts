import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log("AI DESCRIBE RECEIVED BODY:", JSON.stringify(body, null, 2));
        const { productData, language = "it" } = body;

        if (!productData) {
            return NextResponse.json({ error: "No product data provided" }, { status: 400 });
        }

        const prompt = `
Sei un redattore tecnico per cataloghi B2B. Genera una scheda prodotto in ${language} con tono neutro, tecnico e professionale.
NON usare formule di marketing generiche o frasi come "Scopri", "Perfetto per", "Ideale per", "Non lasciarti sfuggire", "Scegli", "Approfitta" o simili.
La descrizione deve attenersi rigorosamente alle informazioni fornite: non inventare mai caratteristiche, applicazioni o valori che non compaiono chiaramente nei dati di input.

IDENTIFICAZIONE PRODOTTO (da usare come riferimento chiave, senza modificarli):
- SKU: ${productData.sku || ''}
- EAN: ${productData.ean || ''}
- Titolo: ${productData.title || ''}

DATI TECNICI DI RIFERIMENTO:
- Brand/Categoria: ${productData.brand || ''} / ${productData.category || ''}
- Descrizione Tecnica/PDF originale (se presente, trattala come fonte principale, senza aggiungere fronzoli): 
${productData.docDescription || ''}

- Altri campi tecnici disponibili (possono essere usati per arricchire in modo aderente alla realtà, non per inventare):
${productData.extraFieldsPreview || ''}

REGOLE TASSATIVE:
1. Usa ESCLUSIVAMENTE i dati forniti o fatti di cui hai certezza assoluta (100%). Non inventare informazioni tecniche, specifiche o varianti inesistenti.
2. Mantieni uno stile sobrio, senza call-to-action o frasi emozionali. Testo "piatto", chiaro e focalizzato sulle caratteristiche.
3. Se un'informazione non è presente nei dati, lascia il campo vuoto o non forzare un contenuto.

FORMATO RICHIESTO (RISPETTA RIGOROSAMENTE I DELIMITATORI):

---SHORT_DESCRIPTION---
[Scrivi qui 1 paragrafo breve, max 2-3 frasi, che riassuma le caratteristiche chiave in modo neutro e tecnico, senza frasi tipo "Scopri", "Perfetto per", "Ideale per"]

---DESCRIPTION---
[Scrivi qui 1-3 paragrafi brevi che descrivano il prodotto in modo chiaro e strutturato, partendo dalla descrizione tecnica originale se presente, senza tono pubblicitario e senza call-to-action]

---BULLET_POINTS---
[Estrai 5-8 punti chiave tecnici del prodotto, uno per riga, in forma sintetica e neutra]

---TECHNICAL_FIELDS---
Colore: [Valore]
Materiale: [Valore]
Dimensioni: [Valore]
Peso: [Valore]
`;

        console.log("AI Describe Request for SKU:", productData.sku);
        if (!process.env.OPENAI_API_KEY) {
            console.error("CRITICAL: OPENAI_API_KEY is not defined in process.env");
            return NextResponse.json({ error: "API Key mancante sul server." }, { status: 500 });
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const stream = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Sei un generatore ultrarapido di schede prodotto professionali. Rispondi SOLO con il contenuto finale, niente introduzioni." },
                { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 800,
            stream: true,
        });

        console.log("OpenAI Stream initiated successfully");

        const responseStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(encoder.encode(content));
                        }
                    }
                } catch (err: any) {
                    console.error("Stream processing error:", err);
                    controller.error(err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(responseStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (err: any) {
        console.error("AI ROUTE CRITICAL FAILURE:", err);
        let detail = err.message;
        if (err.response?.data?.error?.message) {
            detail = err.response.data.error.message;
        } else if (err.status === 401) {
            detail = "API Key non valida o scaduta.";
        } else if (err.status === 429) {
            detail = "Limite di quota raggiunto (Quota Exceeded).";
        }

        return NextResponse.json({
            error: "Errore durante la generazione AI",
            details: detail,
            code: err.status || 500,
        }, { status: 500 });
    }
}

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
Sei un copywriter e-commerce senior. Genera una scheda prodotto professionale in ${language}.
Identifica e separa i dati tecnici dai testi di marketing.

Dati di input:
SKU: ${productData.sku || ''}
Titolo: ${productData.title || ''}
Descrizione Tecnica/PDF: ${productData.docDescription || ''}
Brand/Cat: ${productData.brand || ''} / ${productData.category || ''}

Nelle tue elaborazioni, fai affidamento esclusivamente sui dati forniti o su fatti di cui hai certezza assoluta (100%). Non inventare informazioni tecniche, specifiche o varianti inesistenti.

FORMATO RICHIESTO (RISPETTA RIGOROSAMENTE I DELIMITATORI):

---SHORT_DESCRIPTION---
[Scrivi qui 1 paragrafo breve, max 2-3 frasi, per meta description o estratto rapido SEO, evidenziando il valore del prodotto]

---DESCRIPTION---
[Scrivi qui 3 paragrafi brevi e incisivi di copywriting emozionale, SEO oriented]

---BULLET_POINTS---
[Estrai 5-8 punti chiave tecnici del prodotto, uno per riga, stile bullet point]

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

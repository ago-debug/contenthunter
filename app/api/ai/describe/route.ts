import { NextResponse } from "next/server";
import { OpenAI } from "openai";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { productData, language = "it" } = body;

        if (!productData) {
            return NextResponse.json({ error: "No product data provided" }, { status: 400 });
        }

        const prompt = `
Sei un copywriter e-commerce senior. Genera una descrizione prodotto professionale, SEO ed accattivante in ${language}.
Sii estremamente rapido e conciso, evita introduzioni inutili.

Dati di input:
SKU: ${productData.sku || ''}
Titolo: ${productData.title || ''}
Fornito dal PDF: ${productData.docDescription || ''}
Brand/Cat: ${productData.brand || ''} / ${productData.category || ''}

FORMATO RICHIESTO:
- 3 paragrafi brevi e incisivi.
- Un breve elenco puntato 'Caratteristiche Premium'.
- Markdown pulito.
`;

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: "API Key mancante." }, { status: 500 });
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
                } catch (err) {
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
        console.error("OpenAI Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

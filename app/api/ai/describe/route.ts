import { NextResponse } from "next/server";
import { OpenAI } from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { productData, language = "it" } = body;

        if (!productData) {
            return NextResponse.json({ error: "No product data provided" }, { status: 400 });
        }

        const prompt = `
Sei un esperto copywriter per cataloghi e-commerce. A partire dai seguenti dati grezzi o parziali di un prodotto, crea una descrizione accattivante, SEO-friendly e professionale in lingua ${language}.

Dati prodotto:
SKU: ${productData.sku || 'N/A'}
Titolo originale: ${productData.title || 'N/A'}
Descrizione corrente: ${productData.description || 'N/A'}
Descrizione file originale (Doc): ${productData.docDescription || 'N/A'}
Brand: ${productData.brand || 'N/A'}
Categoria: ${productData.category || 'N/A'}
Dimensioni: ${productData.dimensions || 'N/A'}
Peso: ${productData.weight || 'N/A'}
Materiale/Finitura: ${productData.material || 'N/A'}

Istruzioni:
1. Ignora campi "N/A" o vuoti.
2. Formatta il risultato in Markdown pronto per il web (usa un titolo descrittivo <h3> o paragrafi standard).
3. Usa un tono elegante, commerciale e accattivante.
4. Concludi con un piccolo elenco puntato (Bullet points) dei punti di forza (es. Materiale, Dimensioni ecc.. se presenti).
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Sei un assistente e-commerce preparato ed elegante." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
        });

        const generatedText = completion.choices[0].message.content;

        return NextResponse.json({ success: true, description: generatedText });
    } catch (err: any) {
        console.error("OpenAI Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

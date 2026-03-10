import { OpenAI } from "openai";
import type { ExtractResult, ExtractedProduct, SummarizeResult } from "@/lib/gemini-pdf";

function getOpenAI() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        throw new Error("OPENAI_API_KEY non configurata sul server.");
    }
    return new OpenAI({ apiKey: key });
}

const EXTRACT_PROMPT = `
Sei un analizzatore di PDF (cataloghi, listini, schede tecniche).
Ricevi il contenuto di un PDF (come testo estratto) oppure l'intero documento come contesto.
Devi individuare i PRODOTTI presenti e restituire i dati in JSON.

REGOLE:
1. Identifica, quando possibile: SKU, EAN, Titolo, Descrizione, Prezzo, Brand, Categoria.
2. In 'extraFields' inserisci tutti gli altri dati tecnici rilevanti (colore, materiale, dimensioni, peso, codice produttore, ecc.).
3. Se riesci a capire da che pagina viene il prodotto, imposta 'pageNumber' (numero di pagina 1-based); se non è chiaro, ometti o usa null.
4. Non inventare valori che non vedi; se un campo non è disponibile, metti null o stringa vuota.

FORMATO DI RISPOSTA (solo JSON, nessun testo extra, nessun commento):
{
  "products": [
    {
      "sku": "string",
      "ean": "string | null",
      "title": "string | null",
      "description": "string | null",
      "price": number | null,
      "brand": "string | null",
      "category": "string | null",
      "pageNumber": number | null,
      "image_bbox": [number, number, number, number] | null,
      "extraFields": [{ "key": "string", "value": "string" }]
    }
  ]
}`.trim();

const SUMMARIZE_PROMPT = `
Analizza questo documento PDF (catalogo, listino, schede tecniche) e produci un riassunto strutturato.

REGOLE:
- Non aggiungere testo fuori dal JSON.
- Se non puoi dedurre un campo, usa null o [].

FORMATO:
{
  "summary": "2-4 frasi che descrivono lo scopo del documento e il tipo di contenuti.",
  "pageCount": number | null,
  "sections": string[]
}`.trim();

async function callJsonModel(system: string, user: string): Promise<any> {
    const client = getOpenAI();
    const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        response_format: { type: "json_object" as const },
        temperature: 0.2,
    });

    const raw = resp.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
        throw new Error("Risposta OpenAI non valida (manca contenuto testuale).");
    }
    return JSON.parse(raw);
}

export async function openaiExtractProductsFromPdf(pdfBase64: string): Promise<ExtractResult> {
    // Per semplicità, passiamo il PDF come base64 nel prompt; per documenti grandi
    // conviene prima estrarre il testo lato nostro.
    const user = `Questo è un PDF codificato in base64. Usa solo i contenuti reali che riesci a interpretare, non inventare nulla.

BASE64_PDF:
${pdfBase64.substring(0, 10000)}

Se il PDF è troppo lungo, concentrati sulle prime pagine dove compaiono prodotti, listini o tabelle.`;

    const json = await callJsonModel(
        "Sei un estrattore di prodotti da cataloghi PDF. Rispondi sempre e solo in JSON valido.",
        `${EXTRACT_PROMPT}\n\n${user}`
    );

    const products = Array.isArray(json.products) ? (json.products as ExtractedProduct[]) : [];
    return { products };
}

export async function openaiSummarizePdf(pdfBase64: string): Promise<SummarizeResult> {
    const user = `Questo è un PDF codificato in base64. Estrarre una panoramica sintetica senza inventare contenuti.

BASE64_PDF:
${pdfBase64.substring(0, 10000)}
`;

    const json = await callJsonModel(
        "Sei un assistente che riassume documenti PDF tecnici/commerciali. Rispondi sempre in JSON valido.",
        `${SUMMARIZE_PROMPT}\n\n${user}`
    );

    return {
        summary: json.summary || "",
        pageCount: json.pageCount ?? null,
        sections: Array.isArray(json.sections) ? json.sections : [],
    };
}

export async function openaiAskAboutPdf(pdfBase64: string, question: string): Promise<{ answer: string }> {
    const client = getOpenAI();
    const system =
        "Sei un assistente che risponde a domande su un singolo documento PDF. Usa solo quello che trovi nel documento; se non trovi la risposta, dillo esplicitamente. Rispondi in italiano.";

    const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: system },
            {
                role: "user",
                content:
                    `PDF (base64, potrebbe essere troncato se molto lungo):\n${pdfBase64.substring(
                        0,
                        10000
                    )}\n\nDomanda: ${question}`,
            },
        ],
        temperature: 0.3,
    });

    const answer = resp.choices[0]?.message?.content;
    if (!answer || typeof answer !== "string") {
        throw new Error("Risposta OpenAI non valida (manca contenuto testuale).");
    }
    return { answer };
}



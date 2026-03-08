/**
 * PDF processing via Gemini – NotebookLM-style.
 * Single document as context: analyze, extract products, Q&A.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-2.5-flash";

function getClient() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenerativeAI(key);
}

const EXTRACT_PROMPT = `Sei un analizzatore di documenti stile NotebookLM: leggi il PDF come un unico corpus e estrai dati in modo preciso e strutturato.

Questo PDF è un catalogo prodotti. Per ogni prodotto individuato (anche da tabelle, schede tecniche, listini), restituisci un oggetto JSON.

REGOLE:
1. Identifica SKU, EAN, Titolo, Descrizione, Prezzo, Brand, Categoria.
2. In 'extraFields' metti tutti gli altri dati tecnici (colore, materiale, dimensioni, peso, ecc.).
3. Per ogni prodotto indica 'pageNumber' (numero di pagina) e 'image_bbox': [ymin, xmin, ymax, xmax] in coordinate 0-1000 per l'immagine principale del prodotto nella pagina.
4. Estrai anche da tabelle e liste; unifica righe che si riferiscono allo stesso prodotto.

FORMATO JSON richiesto (solo questo, nessun markdown):
{
  "products": [
    {
      "sku": "string",
      "ean": "string | null",
      "title": "string",
      "description": "string | null",
      "price": number | null,
      "brand": "string | null",
      "category": "string | null",
      "pageNumber": number,
      "image_bbox": [number, number, number, number],
      "extraFields": [{ "key": "string", "value": "string" }]
    }
  ]
}`;

const SUMMARIZE_PROMPT = `Analizza questo documento PDF come farebbe NotebookLM: fornisci un riassunto conciso che aiuti a capire contenuto e struttura.

Rispondi SOLO con un JSON valido, nessun testo prima o dopo:
{
  "summary": "2-4 frasi che descrivono il documento (tipo catalogo, listino, schede tecniche, numero indicativo di prodotti/pagine)",
  "pageCount": number se deducibile,
  "sections": ["titolo sezione 1", "titolo sezione 2"] oppure [] se non applicabile
}`;

export type ExtractedProduct = {
    sku: string;
    ean?: string | null;
    title?: string;
    description?: string | null;
    price?: number | null;
    brand?: string | null;
    category?: string | null;
    pageNumber?: number;
    image_bbox?: [number, number, number, number];
    extraFields?: Array<{ key: string; value: string }>;
};

export type ExtractResult = { products: ExtractedProduct[] };

export type SummarizeResult = {
    summary: string;
    pageCount?: number;
    sections?: string[];
};

/**
 * Extract products from catalog PDF using Gemini (NotebookLM-style document understanding).
 */
export async function extractProductsFromPdf(pdfBase64: string): Promise<ExtractResult> {
    const genAI = getClient();
    if (!genAI) throw new Error("GEMINI_API_KEY not configured.");

    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
        },
    });

    const result = await model.generateContent([
        {
            inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf",
            },
        },
        { text: EXTRACT_PROMPT },
    ]);

    const text = result.response.text() || "{}";
    const parsed = JSON.parse(text) as ExtractResult;
    if (!parsed.products || !Array.isArray(parsed.products)) {
        throw new Error("Risposta AI non valida: mancano 'products'.");
    }
    return parsed;
}

/**
 * Summarize the PDF (NotebookLM-style overview).
 */
export async function summarizePdf(pdfBase64: string): Promise<SummarizeResult> {
    const genAI = getClient();
    if (!genAI) throw new Error("GEMINI_API_KEY not configured.");

    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
        },
    });

    const result = await model.generateContent([
        {
            inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf",
            },
        },
        { text: SUMMARIZE_PROMPT },
    ]);

    const text = result.response.text() || "{}";
    const parsed = JSON.parse(text) as SummarizeResult;
    if (!parsed.summary) throw new Error("Risposta AI non valida: manca 'summary'.");
    return parsed;
}

/**
 * Ask a question about the PDF (NotebookLM-style Q&A). Prefer short questions.
 */
export async function askAboutPdf(pdfBase64: string, question: string): Promise<{ answer: string }> {
    const genAI = getClient();
    if (!genAI) throw new Error("GEMINI_API_KEY not configured.");

    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
        },
    });

    const prompt = `Rispondi alla domanda sull'allegato PDF basandoti SOLO sul contenuto del documento. Sii conciso. Se non trovi informazioni, dillo.

Domanda: ${question}

Rispondi con un JSON: { "answer": "la tua risposta testuale" }`;

    const result = await model.generateContent([
        {
            inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf",
            },
        },
        { text: prompt },
    ]);

    const text = result.response.text() || "{}";
    const parsed = JSON.parse(text) as { answer?: string };
    const answer = parsed.answer != null ? String(parsed.answer) : text;
    return { answer };
}

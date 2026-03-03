import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
const pdfParse = require("pdf-parse");
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300; // 5 minutes for AI extraction
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '100mb',
        },
    },
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string, pdfId: string }> }
) {
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id);
        const parsedPdfId = parseInt(pdfId);

        // 1. Fetch PDF from DB
        const catalogPdf = await prisma.catalogPdf.findUnique({
            where: { id: parsedPdfId }
        });

        if (!catalogPdf) {
            return NextResponse.json({ error: "PDF non trovato." }, { status: 404 });
        }

        // 2. Read PDF File. NOTE: Path stored as `/uploads/xxx.pdf` originally 
        // We strip the leading `/` for safely building path inside `public`
        const safeFilePath = catalogPdf.filePath.startsWith("/") ? catalogPdf.filePath.slice(1) : catalogPdf.filePath;
        const fullPath = path.join(process.cwd(), "public", safeFilePath);

        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: `File fisico PDF non trovato al percorso: ${fullPath}` }, { status: 404 });
        }

        const dataBuffer = fs.readFileSync(fullPath);
        console.log(`Reading file: ${fullPath} (${dataBuffer.length} bytes)`);

        // 3. Extract text
        let textContent = "";
        try {
            console.log("Starting PDF parsing...");
            const pdfData = await pdfParse(dataBuffer);
            textContent = pdfData.text;
            console.log(`Text extracted successfully (${textContent.length} chars)`);
        } catch (parseError: any) {
            console.error("PDF Parsing error:", parseError);
            return NextResponse.json({ error: "Errore durante il parsing del PDF: " + parseError.message }, { status: 500 });
        }

        if (!textContent || textContent.trim().length === 0) {
            console.warn("No text found in PDF.");
            return NextResponse.json({ error: "Il PDF non contiene testo estraibile (potrebbe essere una scansione piatta)." }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "Chiave GEMINI_API_KEY non configurata." }, { status: 500 });
        }

        // 4. Send to Google Gemini (NotebookLM engine) for structured JSON extraction
        // gemini-1.5-pro has a 2-million token context window, perfect for giant PDFs
        const prompt = `Sei un estrattore dati ERP di altissimo livello. 
Il tuo compito è analizzare il testo estratto da un catalogo PDF e restituire SOLO un oggetto JSON strutturato contenente una lista di prodotti.

Testo del catalogo:
"""
${textContent.substring(0, 1500000)} // Gemini can handle massive contexts
"""

REGOLE DI ESTRAZIONE:
1. Trova tutti i prodotti menzionati nel testo.
2. Formato output esatto richiesto:
{
  "products": [
    {
      "sku": "codice univoco articolo",
      "ean": "codice a barre se presente, altrimenti null",
      "title": "nome o titolo del prodotto",
      "description": "descrizione testuale se presente (lunga)",
      "price": 0.00, // numero decimale (es: 100.50)
      "brand": "marca se dedotta dal contesto",
      "category": "categoria se dedotta dal contesto",
      "bulletPoints": "Lista di caratteristiche. Ogni caratteristica su una nuova riga con un trattino. Es: '- Materiale: Ferro\\n- Peso: 2kg'"
    }
  ]
}
3. Cerca di dedurre il prezzo ed eliminare i simboli valutari.
4. Assicurati rigorosamente di restituire JSON valido.`;

        // Configure Gemini 1.5 Pro (The brain behind NotebookLM)
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            generationConfig: {
                temperature: 0.1, // Low temp for deterministic extraction
                responseMimeType: "application/json",
            }
        });

        console.log("Sending to Gemini AI...");
        const aiResponse = await model.generateContent([
            { text: "You are a specialized JSON data extractor for ERP systems." },
            { text: prompt }
        ]);

        console.log("Gemini AI response received.");
        const resultText = aiResponse.response.text() || "{}";
        const parsedResult = JSON.parse(resultText);

        if (!parsedResult.products || !Array.isArray(parsedResult.products)) {
            throw new Error("Formato JSON restituito non valido o prodotti mancanti.");
        }

        const extractedProducts = parsedResult.products;
        let importedCount = 0;

        // 5. Save Extracted Data to StagingProduct
        for (const p of extractedProducts) {
            if (!p.sku || !p.title) continue; // Skip strictly invalid entries

            const staging = await prisma.stagingProduct.create({
                data: {
                    catalogId,
                    sku: String(p.sku).trim(),
                    ean: p.ean ? String(p.ean).trim() : null,
                    brand: p.brand ? String(p.brand).trim() : null,
                    category: p.category ? String(p.category).trim() : null,
                }
            });

            // Texts
            await prisma.stagingProductText.create({
                data: {
                    stagingProductId: staging.id,
                    language: "it",
                    title: String(p.title).trim(),
                    description: p.description ? String(p.description).trim() : null,
                    bulletPoints: p.bulletPoints ? String(p.bulletPoints).trim() : null,
                }
            });

            // Price
            if (p.price !== null && typeof p.price === 'number') {
                await prisma.stagingProductPrice.create({
                    data: {
                        stagingProductId: staging.id,
                        price: p.price
                    }
                });
            }

            importedCount++;
        }

        // Mark PDF as processed
        await prisma.catalogPdf.update({
            where: { id: parsedPdfId },
            data: { processed: true }
        });

        // Set last listino name
        await prisma.catalog.update({
            where: { id: catalogId },
            data: { lastListinoName: `Estrazione_AI_${catalogPdf.fileName}` }
        });

        return NextResponse.json({ success: true, count: importedCount });
    } catch (err: any) {
        console.error("PDF API AI Extraction error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

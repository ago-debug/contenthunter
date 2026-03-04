import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
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

/**
 * PDF DISMANTLER V4 (Professional Grade)
 * Uses Gemini 1.5 Pro Multimodal to analyze PDF structure, extract data, 
 * and identify regions for image isolation.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string, pdfId: string }> }
) {
    const startTime = Date.now();
    try {
        const { id, pdfId } = await params;
        const catalogId = parseInt(id);
        const parsedPdfId = parseInt(pdfId);

        console.log(`[AI-DISMANTLER] Processing PDF ${parsedPdfId} for Catalog ${catalogId}`);

        // 1. Fetch PDF Metadata
        const catalogPdf = await prisma.catalogPdf.findUnique({
            where: { id: parsedPdfId }
        });

        if (!catalogPdf) {
            return NextResponse.json({ error: "PDF not found." }, { status: 404 });
        }

        // 2. Read Physical File
        const safeFilePath = catalogPdf.filePath.startsWith("/") ? catalogPdf.filePath.slice(1) : catalogPdf.filePath;
        const fullPath = path.join(process.cwd(), "public", safeFilePath);

        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: `Physical file not found at: ${fullPath}` }, { status: 404 });
        }

        const pdfBuffer = fs.readFileSync(fullPath);
        const pdfBase64 = pdfBuffer.toString("base64");

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 });
        }

        // 3. Prepare Multi-modal Prompt
        // We instruct Gemini to act as a layout-aware dismantle engine
        const prompt = `Sei l'AI "ContentHunter Dismantler". Il tuo compito è smontare completamente questo catalogo PDF.
        Analizza visivamente la struttura delle pagine e i testi.
        
        Per ogni prodotto individuato, restituisci un oggetto JSON strutturato.
        
        REGOLE:
        1. Identifica SKU, EAN, Titolo, Descrizione, Prezzo e Brand.
        2. ESTRAZIONE TESTI: Prendi tutti i testi tecnici e inseriscili in 'extraFields' se non mappabili nei campi standard.
        3. MAPPATURA PAGINA: Indica il numero di pagina esatto dove si trova il prodotto.
        4. IMAGE BBOX: Fornisci le coordinate [ymin, xmin, ymax, xmax] (valori 0-1000) dell'immagine principale del prodotto nella pagina.
        
        FORMATO RICHIESTO:
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
              "image_bbox": [ymin, xmin, ymax, xmax],
              "extraFields": [
                { "key": "colore", "value": "rosso" },
                { "key": "materiale", "value": "acciaio" }
              ]
            }
          ]
        }`;

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
            }
        });

        console.log(`[AI-DISMANTLER] Sending PDF to Gemini 1.5 Pro (${pdfBuffer.length} bytes)...`);

        const aiResponse = await model.generateContent([
            {
                inlineData: {
                    data: pdfBase64,
                    mimeType: "application/pdf"
                }
            },
            { text: prompt }
        ]);

        const resultText = aiResponse.response.text() || "{}";
        const parsedResult = JSON.parse(resultText);

        if (!parsedResult.products || !Array.isArray(parsedResult.products)) {
            console.error("Malformed AI response:", resultText);
            throw new Error("Invalid response format from AI.");
        }

        const extractedProducts = parsedResult.products;
        console.log(`[AI-DISMANTLER] Successfully identified ${extractedProducts.length} products.`);

        // 4. Atomic Cleanup & Save to Staging
        // We delete existing staging products to avoid duplicates during re-runs
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        let importedCount = 0;

        for (const p of extractedProducts) {
            if (!p.sku) continue;

            try {
                const staging = await prisma.stagingProduct.create({
                    data: {
                        catalogId,
                        sku: String(p.sku).trim(),
                        ean: p.ean ? String(p.ean).trim() : null,
                        brand: p.brand ? String(p.brand).trim() : null,
                        category: p.category ? String(p.category).trim() : null,
                    }
                });

                // Standard Texts
                await prisma.stagingProductText.create({
                    data: {
                        stagingProductId: staging.id,
                        language: "it",
                        title: p.title || "Prodotto senza titolo",
                        description: p.description || null,
                        bulletPoints: p.bulletPoints || null,
                    }
                });

                // Price insertion
                if (p.price) {
                    const parsedPrice = typeof p.price === 'number' ? p.price : parseFloat(String(p.price).replace(/[^0-9.]/g, ''));
                    if (!isNaN(parsedPrice)) {
                        await prisma.stagingProductPrice.create({
                            data: {
                                stagingProductId: staging.id,
                                price: parsedPrice
                            }
                        });
                    }
                }

                // Dynamic Extra Fields (Specs, Bullet points, etc)
                if (p.extraFields && Array.isArray(p.extraFields)) {
                    for (const ef of p.extraFields) {
                        await prisma.stagingProductExtra.create({
                            data: {
                                stagingProductId: staging.id,
                                key: ef.key,
                                value: String(ef.value)
                            }
                        });
                    }
                }

                // Store AI Visual Mapping as metadata in Extra fields for now
                if (p.image_bbox && p.pageNumber) {
                    await prisma.stagingProductExtra.create({
                        data: {
                            stagingProductId: staging.id,
                            key: "_ai_visual_mapping",
                            value: JSON.stringify({
                                page: p.pageNumber,
                                bbox: p.image_bbox,
                                pdfId: parsedPdfId
                            })
                        }
                    });
                }

                importedCount++;
            } catch (pErr) {
                console.error(`[AI-DISMANTLER] Error importing product SKU ${p.sku}:`, pErr);
                // Continue with next product
            }
        }

        // 5. Cleanup and Metadata Updates
        await prisma.catalogPdf.update({
            where: { id: parsedPdfId },
            data: { processed: true }
        });

        await prisma.catalog.update({
            where: { id: catalogId },
            data: { lastListinoName: `Dismantle_V4_${catalogPdf.fileName}` }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[AI-DISMANTLER] Completed in ${duration}s. Processed ${importedCount} products.`);

        return NextResponse.json({
            success: true,
            count: importedCount,
            duration: `${duration}s`
        });

    } catch (err: any) {
        console.error("PDF DISMANTLER CRITICAL ERROR:", err);
        return NextResponse.json({
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}

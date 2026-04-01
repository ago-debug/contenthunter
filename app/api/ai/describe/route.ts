import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import {
    generateProductCopyMerged,
    generateProductCopySingle,
} from "@/lib/ai-product-copy";
import {
    AI_PRODUCT_COPY_FAST,
    AI_PRODUCT_COPY_FULL,
    maxOutputTokensProductCopy,
} from "@/lib/ai-content-budget";
import { createOpenAiCompatibleClient } from "@/lib/openai-compatible-client";

/** Generazione AI può superare il default serverless (60s) su Vercel. */
export const maxDuration = 120;

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const keys = await resolveIntegrationKeys(ctx.companyId);
        if (!keys.openai) {
            console.error("CRITICAL: OPENAI key missing (company settings or OPENAI_API_KEY env)");
            return NextResponse.json(
                {
                    error: "API Key mancante sul server.",
                    details:
                        "Configura la chiave OpenAI in Impostazioni per l’azienda o OPENAI_API_KEY sul server.",
                },
                { status: 500 }
            );
        }

        const body = await req.json();
        const { productData, language = "it", options = {} } = body as {
            productData: any;
            language?: string;
            options?: { fastMode?: boolean; targetFields?: string[] };
        };
        const fastMode = options?.fastMode === true;
        const requestedFieldsRaw = Array.isArray(options?.targetFields) ? options.targetFields : [];
        const requestedFields = requestedFieldsRaw.length > 0
            ? requestedFieldsRaw
            : ["short", "description", "bullets"];
        const needShort = requestedFields.includes("short");
        const needDescription = requestedFields.includes("description");
        const needBullets = requestedFields.includes("bullets");

        if (!productData) {
            return NextResponse.json({ error: "No product data provided" }, { status: 400 });
        }

        let brandGuidelines = "";
        const brandName = (productData.brand || "").toString().trim();
        const brandId = productData.brandId != null ? Number(productData.brandId) : null;
        if (brandName || brandId) {
            const brand = await prisma.brand.findFirst({
                where: brandId
                    ? { id: brandId, companyId: ctx.companyId }
                    : { name: brandName, companyId: ctx.companyId },
                select: { name: true, aiContentGuidelines: true },
            });
            if (brand?.aiContentGuidelines) {
                const bgMax = fastMode
                    ? AI_PRODUCT_COPY_FAST.brandGuidelinesMaxChars
                    : AI_PRODUCT_COPY_FULL.brandGuidelinesMaxChars;
                brandGuidelines = `

LINEA GUIDA BRAND "${brand.name}" (rispetta rigorosamente tono e stile):
${String(brand.aiContentGuidelines).slice(0, bgMax)}
`;
            }
        }
        const docLim = fastMode
            ? AI_PRODUCT_COPY_FAST.docDescriptionMaxChars
            : AI_PRODUCT_COPY_FULL.docDescriptionMaxChars;
        const extraLim = fastMode
            ? AI_PRODUCT_COPY_FAST.extraFieldsMaxChars
            : AI_PRODUCT_COPY_FULL.extraFieldsMaxChars;
        const docDescription = String(productData.docDescription || "").slice(0, docLim);
        const extraFieldsPreview = String(productData.extraFieldsPreview || "").slice(0, extraLim);

        const basePrompt = `
Sei un redattore tecnico per cataloghi B2B. Genera una scheda prodotto in ${language} con tono neutro, tecnico e professionale.
${brandGuidelines}
NON usare formule di marketing generiche o frasi come "Scopri", "Perfetto per", "Ideale per", "Non lasciarti sfuggire", "Scegli", "Approfitta" o simili.
La descrizione deve attenersi rigorosamente alle informazioni fornite: non inventare mai caratteristiche, applicazioni o valori che non compaiono chiaramente nei dati di input.
${fastMode ? "MODALITA FAST: privilegia sintesi e velocita. Descrizione breve e concreta." : ""}

IDENTIFICAZIONE PRODOTTO (da usare come riferimento chiave, senza modificarli):
- SKU: ${productData.sku || ''}
- EAN: ${productData.ean || ''}
- Titolo: ${productData.title || ''}

DATI TECNICI DI RIFERIMENTO:
- Brand/Categoria: ${productData.brand || ''} / ${productData.category || ''}
- Descrizione Tecnica/PDF originale (se presente, trattala come fonte principale, senza aggiungere fronzoli): 
${docDescription}

- Altri campi tecnici disponibili (possono essere usati per arricchire in modo aderente alla realtà, non per inventare):
${extraFieldsPreview}

REGOLE TASSATIVE:
1. Usa ESCLUSIVAMENTE i dati forniti o fatti di cui hai certezza assoluta (100%). Non inventare informazioni tecniche, specifiche o varianti inesistenti.
2. Mantieni uno stile sobrio, senza call-to-action o frasi emozionali. Testo "piatto", chiaro e focalizzato sulle caratteristiche.
3. Se un'informazione non è presente nei dati, lascia il campo vuoto o non forzare un contenuto.
`.trim();

        const sections: string[] = [];
        if (needShort) {
            sections.push(`---SHORT_DESCRIPTION---
[Scrivi qui 1 paragrafo breve, max 2-3 frasi, che riassuma le caratteristiche chiave in modo neutro e tecnico, senza frasi tipo "Scopri", "Perfetto per", "Ideale per"]`);
        }
        if (needDescription) {
            sections.push(`---DESCRIPTION---
[Scrivi qui ${fastMode ? "1 paragrafo breve" : "1-3 paragrafi brevi"} che descriva il prodotto in modo chiaro e strutturato, partendo dalla descrizione tecnica originale se presente, senza tono pubblicitario e senza call-to-action]`);
        }
        if (needBullets) {
            sections.push(`---BULLET_POINTS---
[Estrai ${fastMode ? "4-6" : "5-8"} punti chiave tecnici del prodotto, uno per riga, in forma sintetica e neutra]`);
        }
        if (!fastMode && needDescription) {
            sections.push(`---TECHNICAL_FIELDS---
Colore: [Valore]
Materiale: [Valore]
Dimensioni: [Valore]
Peso: [Valore]`);
        }

        const fullPromptFallback = `${basePrompt}

FORMATO RICHIESTO (RISPETTA RIGOROSAMENTE I DELIMITATORI):
${sections.join("\n\n")}
`;

        const openai = createOpenAiCompatibleClient(keys.openai);
        let text: string;
        const requestedCount = [needShort, needDescription, needBullets].filter(Boolean).length || 1;
        if (fastMode) {
            text = await generateProductCopySingle(openai, {
                fullPrompt: fullPromptFallback.trim(),
                maxTokens: maxOutputTokensProductCopy(requestedCount, true),
            });
        } else {
            try {
                // Solo quando servono tutti i blocchi conviene il merged.
                if (needShort && needDescription && needBullets) {
                    text = await generateProductCopyMerged(openai, {
                        basePrompt: basePrompt.trim(),
                        includeTechnicalFields: true,
                    });
                } else {
                    text = await generateProductCopySingle(openai, {
                        fullPrompt: fullPromptFallback.trim(),
                        maxTokens: maxOutputTokensProductCopy(requestedCount, false),
                    });
                }
            } catch (mergedErr) {
                console.warn("AI describe merged failed, single fallback:", mergedErr);
                text = await generateProductCopySingle(openai, {
                    fullPrompt: fullPromptFallback.trim(),
                    maxTokens: maxOutputTokensProductCopy(requestedCount, false),
                });
            }
        }
        if (!text) {
            return NextResponse.json(
                {
                    error: "Generazione AI vuota",
                    details: "Nessun contenuto restituito dal modello.",
                },
                { status: 502 }
            );
        }
        return new Response(text, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
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

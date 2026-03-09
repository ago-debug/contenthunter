import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { OpenAI } from "openai";

export const maxDuration = 300;

type BulkSeoBody = {
    productIds: number[];
    overwriteExisting?: boolean;
    language?: string;
};

export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "OPENAI_API_KEY mancante sul server." }, { status: 500 });
    }

    let body: BulkSeoBody;
    try {
        body = (await req.json()) as BulkSeoBody;
    } catch {
        return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const { productIds, overwriteExisting = false } = body;
    const language = body.language || "it";

    if (!Array.isArray(productIds) || productIds.length === 0) {
        return NextResponse.json({ error: "productIds deve essere un array non vuoto" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let successCount = 0;
    let errorCount = 0;
    const errors: { productId: number; message: string }[] = [];

    for (const productId of productIds) {
        try {
            const product = await prisma.product.findFirst({
                where: { id: productId, companyId },
                include: {
                    texts: {
                        where: { language },
                    },
                    extraFields: true,
                },
            });

            if (!product) {
                errorCount++;
                errors.push({ productId, message: "Prodotto non trovato per questa azienda" });
                continue;
            }

            const baseText = product.texts[0];
            const extraPreview = product.extraFields
                .map((ef) => `${ef.key}: ${ef.value}`)
                .join(", ")
                .substring(0, 1000);

            // Brand guidelines (stesso schema di /api/ai/describe)
            let brandGuidelines = "";
            if (product.brandId || product.brand) {
                const brand = await prisma.brand.findFirst({
                    where: product.brandId
                        ? { id: product.brandId }
                        : { companyId, name: (product.brand || "").toString().trim() },
                });
                if (brand?.aiContentGuidelines) {
                    brandGuidelines = `

LINEA GUIDA BRAND "${brand.name}" (rispetta rigorosamente tono e stile):
${brand.aiContentGuidelines}
`;
                }
            }

            const prompt = `
Sei un redattore tecnico per cataloghi B2B. Genera una scheda prodotto in ${language} con tono neutro, tecnico e professionale.
${brandGuidelines}
NON usare formule di marketing generiche o frasi come "Scopri", "Perfetto per", "Ideale per", "Non lasciarti sfuggire", "Scegli", "Approfitta" o simili.
La descrizione deve attenersi rigorosamente alle informazioni fornite: non inventare mai caratteristiche, applicazioni o valori che non compaiono chiaramente nei dati di input.

IDENTIFICAZIONE PRODOTTO (da usare come riferimento chiave, senza modificarli):
- SKU: ${product.sku || ""}
- EAN: ${product.ean || ""}
- Titolo: ${baseText?.title || ""}

DATI TECNICI DI RIFERIMENTO:
- Brand/Categoria: ${product.brand || ""} / ${product.category || ""}
- Descrizione Tecnica/PDF originale (se presente, trattala come fonte principale, senza aggiungere fronzoli): 
${baseText?.docDescription || ""}

- Altri campi tecnici disponibili (possono essere usati per arricchire in modo aderente alla realtà, non per inventare):
${extraPreview || ""}

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
`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "Sei un generatore ultrarapido di schede prodotto professionali. Rispondi SOLO con il contenuto finale, niente introduzioni.",
                    },
                    { role: "user", content: prompt },
                ],
                temperature: 0.5,
                max_tokens: 800,
            });

            const content = completion.choices[0]?.message?.content || "";
            if (!content) {
                throw new Error("Risposta AI vuota");
            }

            const shortMatch = content.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
            const descMatch = content.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
            const bulletMatch = content.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);

            const newShort = shortMatch ? shortMatch[1].trim() : "";
            const newDesc = descMatch ? descMatch[1].trim() : "";
            const newBullets = bulletMatch ? bulletMatch[1].trim() : "";

            const existingText = baseText;

            const finalShort =
                overwriteExisting || !existingText?.seoAiText ? newShort || existingText?.seoAiText || null : existingText.seoAiText;
            const finalDesc =
                overwriteExisting || !existingText?.description ? newDesc || existingText?.description || null : existingText.description;
            const finalBullets =
                overwriteExisting || !existingText?.bulletPoints
                    ? newBullets || existingText?.bulletPoints || null
                    : existingText.bulletPoints;

            if (existingText) {
                await prisma.productText.update({
                    where: { id: existingText.id },
                    data: {
                        seoAiText: finalShort,
                        description: finalDesc,
                        bulletPoints: finalBullets,
                    },
                });
            } else {
                await prisma.productText.create({
                    data: {
                        productId: product.id,
                        language,
                        title: baseText?.title || null,
                        description: finalDesc,
                        docDescription: baseText?.docDescription || null,
                        bulletPoints: finalBullets,
                        seoAiText: finalShort,
                    },
                });
            }

            successCount++;
        } catch (err: any) {
            console.error("[SEO BULK] Error on product", productId, err);
            errorCount++;
            errors.push({ productId, message: err?.message || "Errore sconosciuto" });
        }
    }

    return NextResponse.json({
        total: productIds.length,
        success: successCount,
        errors: errorCount,
        errorDetails: errors,
    });
}


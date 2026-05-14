import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { loadProductImageBytes } from "@/lib/load-product-image";
import { generateAmbientProductImageNanoBanana } from "@/lib/gemini-ambient-image";
import { createProductImageFromBuffer } from "@/lib/create-product-image-blob";

export const maxDuration = 300;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;
    const keys = await resolveIntegrationKeys(companyId);

    if (!keys.gemini) {
        return NextResponse.json(
            {
                error:
                    "Chiave Gemini mancante: Impostazioni azienda (Gemini) o GEMINI_API_KEY sul server. Richiesta per Nano Banana.",
            },
            { status: 500 }
        );
    }

    const { id } = await params;
    const productId = parseInt(id, 10);
    if (isNaN(productId)) {
        return NextResponse.json({ error: "ID prodotto non valido" }, { status: 400 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const extraPrompt: string | undefined =
            typeof body?.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined;

        const product = await prisma.product.findFirst({
            where: { id: productId, companyId },
            include: {
                images: {
                    orderBy: { id: "asc" },
                    take: 1,
                },
                texts: {
                    where: { language: "it" },
                    take: 1,
                },
                brandRef: true,
            },
        });

        if (!product) {
            return NextResponse.json({ error: "Prodotto non trovato" }, { status: 404 });
        }

        const baseImage = product.images[0];
        if (!baseImage) {
            return NextResponse.json({ error: "Il prodotto non ha immagini di partenza." }, { status: 400 });
        }

        const title = product.texts[0]?.title || "";
        const basePromptParts: string[] = [];
        if (product.brandRef?.name || product.brand) {
            basePromptParts.push(`prodotto del brand ${product.brandRef?.name || product.brand}`);
        }
        if (title) {
            basePromptParts.push(`titolo scheda: "${title}"`);
        }
        if (product.category) {
            basePromptParts.push(`categoria: ${product.category}`);
        }

        const productContext =
            basePromptParts.length > 0
                ? `Contesto catalogo (italiano): ${basePromptParts.join(" – ")}.`
                : "";
        const extraBlock = extraPrompt ? ` Indicazioni aggiuntive: ${extraPrompt}` : "";

        const editPrompt =
            `Trasforma questa foto prodotto in un'unica fotografia lifestyle professionale, realistiche, luce naturale morbida, ` +
            `ambiente coerente con la categoria. Un solo fotogramma pieno: niente collage, niente split screen, niente doppie figure. ` +
            `Il prodotto dell'input resta il soggetto principale. Nessun testo, watermark o logo aggiunti. ` +
            productContext +
            extraBlock;

        const { buffer: imageBuffer, mime: imageMime } = await loadProductImageBytes(baseImage.imageUrl);
        const imageBase64 = imageBuffer.toString("base64");

        const { mime: outMime, data: outBuffer } = await generateAmbientProductImageNanoBanana({
            apiKey: keys.gemini,
            imageBase64,
            mimeType: imageMime,
            editPrompt,
        });

        const created = await createProductImageFromBuffer({
            productId: product.id,
            buffer: outBuffer,
            mimeType: outMime,
        });

        return NextResponse.json({
            success: true,
            image: {
                id: created.id,
                url: created.url,
            },
        });
    } catch (err: any) {
        console.error("[Ambient Image Gemini / Nano Banana] Error:", err);
        return NextResponse.json(
            { error: err?.message || "Errore durante la generazione con Gemini (Nano Banana)." },
            { status: 500 }
        );
    }
}

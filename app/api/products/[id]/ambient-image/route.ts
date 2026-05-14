import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { toFile } from "openai/uploads";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { createOpenAiOfficialClient } from "@/lib/openai-compatible-client";
import { loadProductImageBytes } from "@/lib/load-product-image";
import { createProductImageFromBuffer } from "@/lib/create-product-image-blob";

const AMBIENT_MODEL = "gpt-image-1.5" as const;

function extractB64(resp: { data?: Array<{ b64_json?: string }> }): string | undefined {
    return resp.data?.[0]?.b64_json;
}

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

    if (!keys.openai) {
        return NextResponse.json(
            { error: "Chiave OpenAI mancante: Impostazioni azienda o OPENAI_API_KEY sul server." },
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
                ? `Product context (Italian catalog): ${basePromptParts.join(" – ")}.`
                : "";
        const extraBlock = extraPrompt ? ` Additional direction: ${extraPrompt}` : "";

        const editPrompt =
            `Transform this input product photo into one professional lifestyle photograph. ` +
            `Output must be a single full-frame image: one coherent photo only. ` +
            `Do NOT create a collage, composite, inset, picture-in-picture, overlay, split screen, or multiple panels. ` +
            `Do NOT duplicate the subject or add a second person/figure; the product from the input must remain the clear hero. ` +
            `Realistic editorial product photography, soft natural light, environment appropriate to the product category. ` +
            `No added text, watermarks, or logos. ` +
            productContext +
            extraBlock;

        const fallbackGeneratePrompt =
            `Single full-frame photograph of a product in a realistic lifestyle setting. ` +
            `One image only: no collage, no inset, no picture-in-picture, no overlay, no duplicate subjects. ` +
            `Professional editorial lighting, no text or logos. ` +
            (productContext ? `${productContext} ` : "") +
            extraBlock;

        const openai = createOpenAiOfficialClient(keys.openai);

        const { buffer: imageBuffer, filename: imageFilename, mime: imageMime } =
            await loadProductImageBytes(baseImage.imageUrl);
        const imageFile = await toFile(imageBuffer, imageFilename, { type: imageMime });

        let imgResp: { data?: Array<{ b64_json?: string }> };
        try {
            imgResp = await openai.images.edit({
                model: AMBIENT_MODEL,
                image: imageFile,
                prompt: editPrompt,
                size: "1024x1024",
                n: 1,
                input_fidelity: "high",
                background: "auto",
            });
        } catch (editErr) {
            console.warn("[Ambient Image] images.edit failed, falling back to generate:", editErr);
            imgResp = await openai.images.generate({
                model: AMBIENT_MODEL,
                prompt: fallbackGeneratePrompt,
                size: "1024x1024",
                n: 1,
            });
        }

        const b64 = extractB64(imgResp);
        if (!b64) {
            return NextResponse.json({ error: "Generazione immagine fallita (risposta vuota)." }, { status: 500 });
        }

        const buffer = Buffer.from(b64, "base64");

        const created = await createProductImageFromBuffer({
            productId: product.id,
            buffer,
            mimeType: "image/png",
        });

        return NextResponse.json({
            success: true,
            image: {
                id: created.id,
                url: created.url,
            },
        });
    } catch (err: any) {
        console.error("[Ambient Image] Error:", err);
        return NextResponse.json(
            { error: err?.message || "Errore durante la generazione dell'immagine ambientata." },
            { status: 500 }
        );
    }
}


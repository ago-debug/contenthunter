import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { OpenAI } from "openai";

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

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "OPENAI_API_KEY mancante sul server." }, { status: 500 });
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

        const scenePrompt =
            `Foto ambientata realistica del prodotto in un contesto d'uso coerente (studio fotografico professionale, luce morbida, sfondo neutro o leggermente contestuale), ` +
            `mantenendo il prodotto ben visibile e centrale. Evita testo o loghi aggiuntivi.\n\n` +
            `Dettagli prodotto: ${basePromptParts.join(" – ")}.` +
            (extraPrompt ? `\nIndicazioni aggiuntive: ${extraPrompt}` : "");

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Generazione immagine a partire da descrizione testuale (utilizza l'immagine esistente solo come riferimento concettuale).
        const imgResp = await openai.images.generate({
            model: "gpt-image-1",
            prompt: scenePrompt,
            size: "1024x1024",
            n: 1,
        } as any);

        const b64 = (imgResp as any).data?.[0]?.b64_json as string | undefined;
        if (!b64) {
            return NextResponse.json({ error: "Generazione immagine fallita (risposta vuota)." }, { status: 500 });
        }

        const buffer = Buffer.from(b64, "base64");
        const uploadsDir = path.join(process.cwd(), "public", "uploads", "ambient");
        await mkdir(uploadsDir, { recursive: true });
        const safeSku = (product.sku || "product").replace(/[^a-zA-Z0-9_-]/g, "_");
        const fileName = `${safeSku}-ambient-${Date.now()}.png`;
        const filePath = path.join(uploadsDir, fileName);
        await writeFile(filePath, buffer);

        const publicUrl = `/uploads/ambient/${fileName}`;

        const created = await prisma.productImage.create({
            data: {
                productId: product.id,
                imageUrl: publicUrl,
            },
        });

        return NextResponse.json({
            success: true,
            image: {
                id: created.id,
                url: publicUrl,
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


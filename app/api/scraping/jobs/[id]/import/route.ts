import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const { id } = await params;
        const jobId = parseInt(id, 10);
        if (!jobId || Number.isNaN(jobId)) {
            return NextResponse.json({ error: "jobId non valido" }, { status: 400 });
        }

        const body = await req.json();
        const catalogId = parseInt(body.catalogId, 10);
        if (!catalogId || Number.isNaN(catalogId)) {
            return NextResponse.json({ error: "catalogId obbligatorio" }, { status: 400 });
        }

        // Verifica che il job appartenga a un progetto della stessa azienda
        const job = await prisma.scrapeJob.findFirst({
            where: {
                id: jobId,
                spider: {
                    project: {
                        companyId,
                    },
                },
            },
            select: { id: true },
        });
        if (!job) {
            return NextResponse.json({ error: "Job non trovato" }, { status: 404 });
        }

        const results = await prisma.scrapeResult.findMany({
            where: { jobId },
            orderBy: { id: "asc" },
        });

        const products: any[] = [];
        for (const r of results) {
            const ext = (r.extracted || {}) as any;
            if (!ext || !Array.isArray(ext.products)) continue;
            for (const p of ext.products) {
                if (!p) continue;
                products.push(p);
            }
        }

        if (products.length === 0) {
            return NextResponse.json(
                { error: "Nessun prodotto trovato nei risultati di questo job." },
                { status: 400 }
            );
        }

        // Svuota lo staging del catalogo
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        let created = 0;

        for (const raw of products) {
            const p: any = raw || {};
            const sku = p.sku || p.SKU || p.code || null;
            if (!sku) continue;

            const ean = p.ean || p.EAN || null;
            const name = p.name || p.title || null;
            const priceRaw = p.price || null;
            const brand = p.brand || null;
            const category = p.categoryName || p.category || null;
            const attrs: Record<string, string> = p.attributes || {};

            const bulletLines: string[] = [];
            for (const [k, v] of Object.entries(attrs)) {
                if (!v) continue;
                bulletLines.push(`${k}: ${v}`);
            }
            const bulletPoints = bulletLines.join("\n") || null;

            const staging = await prisma.stagingProduct.create({
                data: {
                    catalogId,
                    sku: String(sku),
                    ean: ean ? String(ean) : null,
                    parentSku: null,
                    brand: brand ? String(brand) : null,
                    category: category ? String(category) : null,
                },
            });

            await prisma.stagingProductText.create({
                data: {
                    stagingProductId: staging.id,
                    language: "it",
                    title: name ? String(name) : null,
                    description: null,
                    bulletPoints,
                },
            });

            if (priceRaw) {
                let priceStr = priceRaw.toString().replace(/[^0-9,.-]/g, "");
                if (priceStr.includes(",") && priceStr.includes(".")) {
                    const lastComma = priceStr.lastIndexOf(",");
                    const lastDot = priceStr.lastIndexOf(".");
                    if (lastComma > lastDot) {
                        priceStr = priceStr.replace(/\./g, "").replace(",", ".");
                    } else {
                        priceStr = priceStr.replace(/,/g, "");
                    }
                } else if (priceStr.includes(",")) {
                    priceStr = priceStr.replace(",", ".");
                }
                const parsedPrice = parseFloat(priceStr);
                if (!isNaN(parsedPrice)) {
                    await prisma.stagingProductPrice.create({
                        data: {
                            stagingProductId: staging.id,
                            price: parsedPrice,
                        },
                    });
                }
            }

            if (p.mainImage) {
                await prisma.stagingProductImage.create({
                    data: {
                        stagingProductId: staging.id,
                        imageUrl: String(p.mainImage),
                    },
                });
            }

            created++;
        }

        return NextResponse.json({
            success: true,
            imported: created,
            totalFound: products.length,
        });
    } catch (err: any) {
        console.error("[SCRAPING][IMPORT] error", err);
        return NextResponse.json(
            { error: "Errore durante l'import nel Lab: " + (err?.message || "") },
            { status: 500 }
        );
    }
}


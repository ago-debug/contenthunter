import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";

function isRealProduct(p: any): boolean {
    if (!p) return false;
    const hasId = !!(p.name && String(p.name).trim()) || !!(p.sku && String(p.sku).trim()) || !!(p.ean && String(p.ean).trim());
    const hasPrice = p.price != null && String(p.price).trim() !== "";
    const hasImage = !!(p.mainImage || (p.images && p.images.length > 0));
    const hasDesc = !!(p.description && String(p.description).trim());
    const hasProductUrl = !!(p.url && String(p.url).trim());
    return hasId && (hasPrice || hasImage || hasDesc) && hasProductUrl;
}

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
            // Seleziona solo il JSON estratto per evitare payload enormi/non necessari
            select: { extracted: true },
        });

        const byUrl = new Map<string, any>();
        for (const r of results) {
            const ext = (r.extracted || {}) as any;
            if (!ext || !Array.isArray(ext.products)) continue;
            for (const p of ext.products) {
                if (!p || !isRealProduct(p)) continue;
                const url = (p.url && String(p.url).trim()) || "";
                if (url && !byUrl.has(url)) byUrl.set(url, p);
            }
        }
        const products = Array.from(byUrl.values());

        if (products.length === 0) {
            return NextResponse.json(
                { error: "Nessun prodotto trovato nei risultati di questo job." },
                { status: 400 }
            );
        }

        // Carica i prodotti già esistenti collegati a questo catalogo,
        // per poter fare il match (SKU -> EAN -> titolo) durante l'import.
        const existingEntries = await prisma.catalogEntry.findMany({
            where: { catalogId },
            include: {
                product: {
                    include: {
                        texts: {
                            where: { language: "it" },
                        },
                    },
                },
            },
        });

        const normalizeSku = (v: any) =>
            (v ? String(v).trim().toUpperCase() : "") || "";
        const normalizeEan = (v: any) =>
            (v ? String(v).replace(/[^\d]/g, "") : "") || "";
        const normalizeTitle = (v: any) =>
            (v
                ? String(v)
                      .toLowerCase()
                      .replace(/[^a-z0-9àèéìòùç\s]/gi, " ")
                      .replace(/\s+/g, " ")
                      .trim()
                : "") || "";

        const bySku = new Map<string, { id: number; title: string | null }>();
        const byEan = new Map<string, { id: number; title: string | null }>();
        const byTitle = new Map<string, { id: number }>();

        for (const entry of existingEntries) {
            const prod = entry.product;
            if (!prod) continue;
            const text = prod.texts[0];
            const title = text?.title || null;

            const kSku = normalizeSku(prod.sku);
            if (kSku) bySku.set(kSku, { id: prod.id, title });

            const kEan = normalizeEan(prod.ean);
            if (kEan) byEan.set(kEan, { id: prod.id, title });

            const kTitle = normalizeTitle(title);
            if (kTitle && !byTitle.has(kTitle)) {
                byTitle.set(kTitle, { id: prod.id });
            }
        }

        // Svuota lo staging del catalogo
        await prisma.stagingProduct.deleteMany({ where: { catalogId } });

        let created = 0;

        for (const raw of products) {
            const p: any = raw || {};
            const skuRaw = p.sku || p.SKU || p.code || null;
            if (!skuRaw) continue;

            const eanRaw = p.ean || p.EAN || null;
            const nameRaw = p.name || p.title || null;
            const priceRaw = p.price || null;
            const brand = p.brand || null;
            const category = p.categoryName || p.category || null;
            const attrs: Record<string, string> = p.attributes || {};

            const skuNorm = normalizeSku(skuRaw);
            const eanNorm = normalizeEan(eanRaw);
            const titleNorm = normalizeTitle(nameRaw);

            let matchedProductId: number | null = null;
            let matchMethod: "sku" | "ean" | "title" | null = null;

            if (skuNorm && bySku.has(skuNorm)) {
                matchedProductId = bySku.get(skuNorm)!.id;
                matchMethod = "sku";
            } else if (eanNorm && byEan.has(eanNorm)) {
                matchedProductId = byEan.get(eanNorm)!.id;
                matchMethod = "ean";
            } else if (titleNorm && byTitle.has(titleNorm)) {
                matchedProductId = byTitle.get(titleNorm)!.id;
                matchMethod = "title";
            }

            const bulletLines: string[] = [];
            for (const [k, v] of Object.entries(attrs)) {
                if (!v) continue;
                bulletLines.push(`${k}: ${v}`);
            }
            const bulletPoints = bulletLines.join("\n") || null;

            const staging = await prisma.stagingProduct.create({
                data: {
                    catalogId,
                    sku: String(skuRaw),
                    ean: eanRaw ? String(eanRaw) : null,
                    parentSku: null,
                    brand: brand ? String(brand) : null,
                    category: category ? String(category) : null,
                },
            });

            await prisma.stagingProductText.create({
                data: {
                    stagingProductId: staging.id,
                    language: "it",
                    title: nameRaw ? String(nameRaw) : null,
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

            // Salva informazioni di match come extra fields nello staging,
            // così il Lab può mostrare che esiste già un prodotto collegato.
            if (matchedProductId && matchMethod) {
                await prisma.stagingProductExtra.createMany({
                    data: [
                        {
                            stagingProductId: staging.id,
                            key: "matchedProductId",
                            value: String(matchedProductId),
                        },
                        {
                            stagingProductId: staging.id,
                            key: "matchedBy",
                            value: matchMethod,
                        },
                    ],
                    skipDuplicates: true,
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


import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import * as cheerio from "cheerio";

// Elenco job per spider o progetto
export async function GET(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const url = new URL(req.url);
        const spiderIdParam = url.searchParams.get("spiderId");

        if (!spiderIdParam) {
            return NextResponse.json({ error: "spiderId obbligatorio" }, { status: 400 });
        }

        const spiderId = parseInt(spiderIdParam, 10);
        if (Number.isNaN(spiderId)) {
            return NextResponse.json({ error: "spiderId non valido" }, { status: 400 });
        }

        // Verifica che lo spider appartenga a un progetto della stessa azienda
        const spider = await prisma.scrapeSpider.findFirst({
            where: {
                id: spiderId,
                project: {
                    companyId,
                },
            },
            select: { id: true },
        });
        if (!spider) {
            return NextResponse.json({ error: "Spider non trovato" }, { status: 404 });
        }

        const jobs = await prisma.scrapeJob.findMany({
            where: { spiderId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return NextResponse.json(jobs);
    } catch (err: any) {
        console.error("[SCRAPING][JOBS][GET] error", err);
        return NextResponse.json({ error: "Errore nel caricamento dei job di scraping." }, { status: 500 });
    }
}

// Crea un nuovo job e prova ad eseguirlo subito (sincrono su una singola pagina)
export async function POST(req: NextRequest) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    try {
        const body = await req.json();
        const spiderId = parseInt(body.spiderId, 10);

        if (!spiderId || Number.isNaN(spiderId)) {
            return NextResponse.json({ error: "spiderId obbligatorio" }, { status: 400 });
        }

        const spider = await prisma.scrapeSpider.findFirst({
            where: {
                id: spiderId,
                project: {
                    companyId,
                },
            },
            select: { id: true, startUrl: true },
        });
        if (!spider) {
            return NextResponse.json({ error: "Spider non trovato" }, { status: 404 });
        }

        // 1) Crea il job in stato pending
        let job = await prisma.scrapeJob.create({
            data: {
                spiderId,
                status: "pending",
            },
        });

        // 2) Esegui subito uno scraping base (una sola pagina: startUrl o url passato nel body)
        const targetUrl: string | null = (body.url ?? spider.startUrl ?? null) || null;
        if (!targetUrl) {
            return NextResponse.json(
                { error: "Nessun URL di partenza definito per lo spider." },
                { status: 400 }
            );
        }

        try {
            job = await prisma.scrapeJob.update({
                where: { id: job.id },
                data: {
                    status: "running",
                    startedAt: new Date(),
                },
            });

            const resp = await fetch(targetUrl, { method: "GET" });
            const html = await resp.text();

            const extracted = basicExtractFromHtml(html, targetUrl);

            await prisma.scrapeResult.create({
                data: {
                    jobId: job.id,
                    url: targetUrl,
                    statusCode: resp.status,
                    rawHtml: html,
                    extracted,
                },
            });

            job = await prisma.scrapeJob.update({
                where: { id: job.id },
                data: {
                    status: "done",
                    finishedAt: new Date(),
                    totalPages: 1,
                    successCount: 1,
                    errorCount: 0,
                    logSnippet: `Fetched ${targetUrl} with status ${resp.status}`,
                },
            });
        } catch (runErr: any) {
            console.error("[SCRAPING][JOBS][RUN] error", runErr);
            job = await prisma.scrapeJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    finishedAt: new Date(),
                    errorCount: 1,
                    logSnippet: runErr?.message ?? "Errore esecuzione job",
                },
            });
        }

        return NextResponse.json(job, { status: 201 });
    } catch (err: any) {
        console.error("[SCRAPING][JOBS][POST] error", err);
        return NextResponse.json({ error: "Errore nella creazione del job di scraping." }, { status: 500 });
    }
}

function makeAbsoluteUrl(href: string | undefined, base: string): string | null {
    if (!href) return null;
    try {
        return new URL(href, base).toString();
    } catch {
        return null;
    }
}

function basicExtractFromHtml(html: string, url: string): any {
    const $ = cheerio.load(html);

    const title = ($("meta[property='og:title']").attr("content") ||
        $("title").first().text() ||
        $("h1").first().text() ||
        "").trim();

    const categoryName =
        $("nav [aria-current='page']").last().text().trim() ||
        $(".breadcrumb li").last().text().trim() ||
        "";

    const products: any[] = [];

    // Heuristica: blocchi prodotto
    const productSelectors = [
        "[itemtype*='Product']",
        ".product",
        ".product-item",
        ".product-card",
        ".productGrid .grid-item",
    ];

    const seen = new Set<string>();

    $(productSelectors.join(",")).each((_, el) => {
        const block = $(el);
        const name =
            block.find("[itemprop='name']").first().text().trim() ||
            block.find("h2, h3").first().text().trim();

        const priceText =
            block.find("[itemprop='price']").first().text().trim() ||
            block.find(".price, .product-price").first().text().trim();

        const imgSrc = block.find("img").first().attr("src") || undefined;
        const productUrl = block.find("a").first().attr("href") || undefined;

        const absUrl = makeAbsoluteUrl(productUrl, url);
        const absImg = makeAbsoluteUrl(imgSrc, url) || imgSrc || null;

        const key = `${absUrl || ""}|${name}`;
        if (seen.has(key)) return;
        seen.add(key);

        if (!name && !absUrl && !absImg) return;

        products.push({
            url: absUrl,
            name: name || null,
            price: priceText || null,
            mainImage: absImg,
        });
    });

    // Fallback: se non abbiamo trovato nulla, almeno una lista di immagini
    if (products.length === 0) {
        $("img").slice(0, 24).each((_, el) => {
            const src = $(el).attr("src") || undefined;
            const absImg = makeAbsoluteUrl(src, url) || src || null;
            if (!absImg) return;
            products.push({
                url,
                name: $(el).attr("alt") || null,
                price: null,
                mainImage: absImg,
            });
        });
    }

    return {
        url,
        title,
        categoryName: categoryName || null,
        products,
    };
}


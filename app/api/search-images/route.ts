import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

// Some dependencies (and/or Node versions) may expect `globalThis.File`.
// We polyfill it defensively to avoid build/runtime crashes.
if (typeof (globalThis as any).File === "undefined") {
    (globalThis as any).File = class File {
        parts: any[];
        name: string;
        type: string;
        lastModified: number;
        constructor(parts: any[], name: string, options: any = {}) {
            this.parts = parts;
            this.name = name;
            this.type = options.type || "";
            this.lastModified = options.lastModified || Date.now();
        }
    };
}

export const runtime = "nodejs";

function parseBoolean(v: string | null | undefined) {
    if (!v) return false;
    return v === "true" || v === "1" || v === "yes" || v === "on";
}

function uniqBy<T>(arr: T[], keyFn: (t: T) => string) {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of arr) {
        const k = keyFn(item);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(item);
    }
    return out;
}

function safeHostname(urlOrDomain: string) {
    if (!urlOrDomain) return "";
    try {
        const u = new URL(urlOrDomain.includes("://") ? urlOrDomain : `https://${urlOrDomain}`);
        return u.hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
        return urlOrDomain.replace(/^www\./i, "").toLowerCase();
    }
}

function isAllowedBySources(linkOrUrl: string | undefined, allowedHostnames: string[]) {
    if (!linkOrUrl) return false;
    if (allowedHostnames.length === 0) return true;
    const hostname = safeHostname(linkOrUrl);
    if (!hostname) return false;
    return allowedHostnames.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

function extractCandidatesFromQuery(q: string) {
    const query = (q || "").trim();
    const eanMatches = query.match(/\b(\d{8,14})\b/g) || [];
    const ean = eanMatches.length > 0 ? eanMatches[0] : null;

    const tokens = query
        .split(/[\s,;|/\\]+/g)
        .map((t) => t.trim())
        .filter(Boolean);

    const skuTokens: string[] = [];
    for (const tok of tokens) {
        const cleaned = tok.replace(/[^\w\.\-]+/g, "");
        if (!cleaned) continue;
        if (ean && cleaned === ean) continue;
        if (!/^[A-Za-z0-9][A-Za-z0-9\.\-_]{2,}$/.test(cleaned)) continue;
        // If it's purely numeric (and not an EAN), ignore: too noisy.
        if (!/[A-Za-z]/.test(cleaned) && cleaned.length <= 8) continue;
        skuTokens.push(cleaned);
    }

    // Prefer the "most specific" token (longest).
    skuTokens.sort((a, b) => b.length - a.length);

    return {
        query,
        ean,
        skuToken: skuTokens[0] || null,
        skuTokens: skuTokens.slice(0, 5),
    };
}

function scoreResult(candidate: { title?: string; link?: string }, ean: string | null, skuToken: string | null) {
    const title = (candidate.title || "").toLowerCase();
    const link = (candidate.link || "").toLowerCase();
    let score = 0;
    if (ean) {
        const eanL = ean.toLowerCase();
        if (title.includes(eanL)) score += 5;
        if (link.includes(eanL)) score += 3;
    }
    if (skuToken) {
        const skuL = skuToken.toLowerCase();
        if (title.includes(skuL)) score += 3;
        if (link.includes(skuL)) score += 2;
    }
    return score;
}

async function serpApiGoogleShoppingSearch(args: {
    apiKey: string;
    q: string;
    gl?: string;
    hl?: string;
    num?: number;
}) {
    const { apiKey, q, gl = "it", hl = "it", num = 18 } = args;
    const url = "https://serpapi.com/search.json";
    const resp = await axios.get(url, {
        timeout: 12000,
        params: {
            engine: "google_shopping",
            api_key: apiKey,
            q,
            gl,
            hl,
            num,
        },
    });
    return resp.data as any;
}

function parseGoogleShoppingResults(data: any) {
    const items: any[] = [];
    if (Array.isArray(data?.shopping_results)) items.push(...data.shopping_results);
    if (Array.isArray(data?.inline_shopping_results)) items.push(...data.inline_shopping_results);
    if (Array.isArray(data?.categorized_shopping_results)) {
        for (const cat of data.categorized_shopping_results) {
            if (Array.isArray(cat?.shopping_results)) items.push(...cat.shopping_results);
        }
    }
    return items.filter(Boolean);
}

function getShoppingThumbnail(item: any) {
    if (typeof item?.thumbnail === "string" && item.thumbnail) return item.thumbnail;
    if (Array.isArray(item?.serpapi_thumbnails) && item.serpapi_thumbnails[0]) return item.serpapi_thumbnails[0];
    if (Array.isArray(item?.thumbnails) && item.thumbnails[0]) return item.thumbnails[0];
    return "";
}

// Fallback: try official sites by scanning sitemaps/JSON-LD for Product nodes.
// This is intentionally capped (few sitemaps + few pages) to keep the request fast.
const PRODUCT_PATH_PATTERN = /\/?(p|prodotto|product|prodotti|products|shop\/[^/]+|item|articolo)(\/|$|\?)/i;
async function fetchRobotsAndSitemaps(origin: string) {
    const out: string[] = [];
    try {
        const resp = await axios.get(`${origin}/robots.txt`, { timeout: 8000, responseType: "text" });
        const text = String(resp.data || "");
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const m = line.match(/^Sitemap:\s*(https?:\/\/[^\s#]+)/i);
            if (m?.[1]) out.push(m[1].trim());
        }
    } catch {
        // ignore
    }
    if (out.length === 0) {
        // Simple fallback paths (common conventions)
        for (const path of [
            "/sitemap.xml",
            "/sitemap_index.xml",
            "/sitemap-index.xml",
            "/sitemap_products.xml",
            "/product-sitemap.xml",
        ]) {
            out.push(`${origin}${path}`);
        }
    }
    return out;
}

function normalizeUrlForCrawl(u: string) {
    try {
        const parsed = new URL(u);
        return parsed.origin + parsed.pathname + parsed.search;
    } catch {
        return u;
    }
}

function looksLikeProductUrl(urlStr: string) {
    try {
        const path = new URL(urlStr).pathname || "";
        return PRODUCT_PATH_PATTERN.test(path);
    } catch {
        return false;
    }
}

async function fetchSitemapAndCollectUrls(args: {
    sitemapUrl: string;
    origin: string;
    depth: number;
    maxDepth: number;
    skipExt: RegExp;
}) {
    const { sitemapUrl, origin, depth, maxDepth, skipExt } = args;
    const urls: string[] = [];
    if (depth > maxDepth) return urls;
    try {
        const resp = await axios.get(sitemapUrl, { timeout: 12000, responseType: "text" });
        if (!resp.data) return urls;
        const xml = String(resp.data);
        const $ = cheerio.load(xml, { xmlMode: true });

        const sitemapLocs: string[] = [];
        $("sitemap loc").each((_, el) => {
            const loc = $(el).text().trim();
            if (loc) sitemapLocs.push(loc);
        });

        if (sitemapLocs.length > 0) {
            for (const loc of sitemapLocs) {
                try {
                    const child = new URL(loc);
                    if (child.origin !== origin) continue;
                    urls.push(
                        ...(await fetchSitemapAndCollectUrls({
                            sitemapUrl: loc,
                            origin,
                            depth: depth + 1,
                            maxDepth,
                            skipExt,
                        }))
                    );
                } catch {
                    // ignore
                }
            }
            return urls;
        }

        $("url loc, loc").each((_, el) => {
            const loc = $(el).text().trim();
            if (!loc) return;
            try {
                const u = new URL(loc);
                if (u.origin !== origin) return;
                if (skipExt.test(loc)) return;
                urls.push(normalizeUrlForCrawl(loc));
            } catch {
                // ignore
            }
        });
    } catch {
        // ignore
    }
    return urls;
}

function makeAbsoluteUrl(href: string, base: string) {
    if (!href) return "";
    try {
        return new URL(href, base).toString();
    } catch {
        return href;
    }
}

function normalizeSchemaProduct(prod: any, baseUrl: string) {
    const urlFromData = prod?.url || prod?.offers?.url || null;
    const url = urlFromData ? makeAbsoluteUrl(String(urlFromData), baseUrl) : baseUrl;

    const images: string[] = [];
    if (Array.isArray(prod?.image)) {
        for (const img of prod.image) {
            const abs = makeAbsoluteUrl(String(img), baseUrl);
            if (abs) images.push(abs);
        }
    } else if (prod?.image) {
        const abs = makeAbsoluteUrl(String(prod.image), baseUrl);
        if (abs) images.push(abs);
    }

    return {
        url,
        name: prod?.name || null,
        description: prod?.description || null,
        price: prod?.offers?.price || prod?.price || null,
        mainImage: images[0] || null,
        images,
        sku: prod?.sku || prod?.skuId || null,
        ean:
            prod?.gtin13 ||
            prod?.gtin ||
            prod?.gtin14 ||
            prod?.gtin12 ||
            prod?.gtin8 ||
            null,
        brand: prod?.brand?.name || prod?.brand || null,
        attributes: {},
    };
}

function extractProductNodesFromJsonLd(html: string) {
    const $ = cheerio.load(html);
    const products: any[] = [];

    $("script[type='application/ld+json']").each((_, el) => {
        const raw = $(el).contents().text();
        if (!raw) return;
        try {
            const json = JSON.parse(raw);
            const collect = (node: any) => {
                if (!node) return;
                const t = node["@type"];
                const isProduct =
                    (typeof t === "string" && t.toLowerCase().includes("product")) ||
                    (Array.isArray(t) && t.some((x: any) => String(x).toLowerCase().includes("product")));
                if (isProduct) products.push(node);

                if (Array.isArray(node?.["@graph"])) {
                    for (const g of node["@graph"]) collect(g);
                }
                if (Array.isArray(node?.itemListElement)) {
                    for (const it of node.itemListElement) collect(it?.item || it);
                }
            };

            if (Array.isArray(json)) {
                for (const node of json) collect(node);
            } else {
                collect(json);
            }
        } catch {
            // ignore invalid json
        }
    });

    return products;
}

async function crawlOfficialSourcesForImages(args: {
    sources: string[];
    query: string;
    ean: string | null;
    skuToken: string | null;
}) {
    const { sources, query, ean, skuToken } = args;
    const allowedOrigins: string[] = [];

    for (const s of sources) {
        try {
            const u = new URL(s.includes("://") ? s : `https://${s}`);
            allowedOrigins.push(u.origin);
        } catch {
            // ignore
        }
    }

    const allowedOriginsUnique = uniqBy(allowedOrigins, (x) => x);
    if (allowedOriginsUnique.length === 0) return [];

    const skipExt = /\.(pdf|zip|rar|jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ico|mp4|webm)(\?|$)/i;

    const urlsToFetch: string[] = [];
    const maxSitemapsPerOrigin = 4;
    const maxUrlsTotal = 22;
    const maxProductPagesFetch = 8;

    for (const origin of allowedOriginsUnique.slice(0, 5)) {
        if (urlsToFetch.length >= maxUrlsTotal) break;

        const sitemapCandidates = await fetchRobotsAndSitemaps(origin);
        const picked = sitemapCandidates.slice(0, maxSitemapsPerOrigin);

        for (const sitemapUrl of picked) {
            if (urlsToFetch.length >= maxUrlsTotal) break;
            const collected = await fetchSitemapAndCollectUrls({
                sitemapUrl,
                origin,
                depth: 0,
                maxDepth: 2,
                skipExt,
            });

            const filtered = collected
                .filter((u) => {
                    if (!u) return false;
                    if (looksLikeProductUrl(u)) return true;
                    if (ean) return u.includes(ean);
                    return true;
                })
                .filter((u) => (skuToken ? u.toLowerCase().includes(skuToken.toLowerCase()) || looksLikeProductUrl(u) : true));

            // If we have explicit matching candidates (EAN/SKU), prioritize them.
            const prioritized =
                ean || skuToken
                    ? filtered.sort((a, b) => {
                        const aScore = (ean && a.includes(ean)) || (skuToken && a.toLowerCase().includes(skuToken.toLowerCase())) ? 1 : 0;
                        const bScore = (ean && b.includes(ean)) || (skuToken && b.toLowerCase().includes(skuToken.toLowerCase())) ? 1 : 0;
                        return bScore - aScore;
                    })
                    : filtered;

            for (const u of prioritized.slice(0, 10)) {
                if (urlsToFetch.length >= maxUrlsTotal) break;
                urlsToFetch.push(u);
            }
        }
    }

    const urlsUnique = uniqBy(urlsToFetch, (u) => u);
    const results: any[] = [];

    for (const productUrl of urlsUnique.slice(0, maxProductPagesFetch)) {
        try {
            const resp = await axios.get(productUrl, { timeout: 10000, responseType: "text" });
            const html = String(resp.data || "");
            const baseUrl = new URL(productUrl).origin;
            const jsonLdProducts = extractProductNodesFromJsonLd(html);
            if (!jsonLdProducts || jsonLdProducts.length === 0) continue;

            for (const node of jsonLdProducts.slice(0, 5)) {
                const normalized = normalizeSchemaProduct(node, baseUrl);

                const matches =
                    (ean && normalized.ean && String(normalized.ean) === String(ean)) ||
                    (skuToken && normalized.sku && String(normalized.sku).toLowerCase().includes(String(skuToken).toLowerCase()));

                if (!matches && (ean || skuToken)) continue;

                if (Array.isArray(normalized.images) && normalized.images.length > 0) {
                    for (const imgUrl of normalized.images.slice(0, 6)) {
                        results.push({
                            url: imgUrl,
                            source: `Official:${safeHostname(productUrl)}`,
                            productData: {
                                title: normalized.name,
                                price: normalized.price != null ? String(normalized.price) : undefined,
                                description: normalized.description,
                                brand: normalized.brand,
                            },
                        });
                    }
                }
            }
        } catch {
            // ignore single page errors
        }
    }

    return results;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    // UI uses both `q` and `query` params in different places.
    const qParam = searchParams.get("q") || searchParams.get("query");
    const sourcesParam = searchParams.get("sources") || "";
    const shopping =
        parseBoolean(searchParams.get("shopping")) ||
        parseBoolean(searchParams.get("useShopping")) ||
        parseBoolean(searchParams.get("shoppingMode"));

    const query = (qParam || "").trim();
    if (!query) return NextResponse.json({ images: [] });

    const sources = sourcesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const allowedHostnames = sources
        .map((s) => safeHostname(s))
        .filter(Boolean);

    const candidates = extractCandidatesFromQuery(query);
    const ean = candidates.ean;
    const skuToken = candidates.skuToken;

    const serpApiKey = process.env.SERPAPI_KEY || process.env.SERPAPI || "";

    const maxImages = 24;
    let images: any[] = [];

    // Phase 1: Google Merchant (Shopping) via SerpApi (if configured)
    if (shopping && serpApiKey) {
        const domains = uniqBy(
            sources
                .map((s) => {
                    try {
                        const u = new URL(s.includes("://") ? s : `https://${s}`);
                        return u.hostname.replace(/^www\./i, "").toLowerCase();
                    } catch {
                        return "";
                    }
                })
                .filter(Boolean),
            (x) => x
        ).slice(0, 3);

        const queries: string[] = [];
        if (domains.length > 0) {
            const base = ean || skuToken ? `${ean || skuToken}` : query;
            for (const d of domains) queries.push(`${base} site:${d}`);
        } else {
            queries.push(ean || skuToken ? `${ean || skuToken}` : query);
        }

        for (const searchQ of queries.slice(0, 3)) {
            if (images.length >= maxImages) break;
            try {
                const data = await serpApiGoogleShoppingSearch({
                    apiKey: serpApiKey,
                    q: searchQ,
                    gl: "it",
                    hl: "it",
                    num: 18,
                });
                const items = parseGoogleShoppingResults(data);

                const mapped = items.map((it: any) => {
                    const link = it?.product_link || it?.link;
                    return {
                        url: getShoppingThumbnail(it),
                        source: it?.source || "Shop",
                        productData: {
                            title: it?.title,
                            price: it?.price || (it?.extracted_price != null ? String(it.extracted_price) : undefined),
                            description: it?.snippet,
                            brand: it?.source,
                        },
                        link,
                        _score: scoreResult({ title: it?.title, link }, ean, skuToken),
                    };
                });

                const filtered = mapped
                    .filter((m) => typeof m.url === "string" && m.url.length > 0)
                    .filter((m) => isAllowedBySources(m.link, allowedHostnames));

                filtered.sort((a, b) => (b._score || 0) - (a._score || 0));

                images.push(
                    ...filtered.map((x) => ({
                        url: x.url,
                        source: x.source,
                        productData: x.productData,
                    }))
                );
            } catch {
                // ignore SerpApi failures
            }
        }

        images = images.slice(0, maxImages);
    }

    // Phase 2: Google Images as general fallback (or when merchant produced nothing)
    if (images.length === 0) {
        if (serpApiKey) {
            const base = ean || skuToken ? `${ean || skuToken}` : query;
            const domains = allowedHostnames.slice(0, 2);
            const queries = domains.length > 0 ? domains.map((d) => `${base} site:${d}`) : [base];

            const collected: any[] = [];
            for (const searchQ of queries.slice(0, 2)) {
                if (collected.length >= maxImages) break;
                try {
                    const resp = await axios.get("https://serpapi.com/search.json", {
                        timeout: 12000,
                        params: {
                            engine: "google_images",
                            api_key: serpApiKey,
                            q: searchQ,
                            gl: "it",
                            hl: "it",
                            num: 18,
                        },
                    });
                    const data = resp.data as any;
                    const items = Array.isArray(data?.images_results) ? data.images_results : [];
                    for (const it of items) {
                        const original = it?.original;
                        const thumbnail = it?.thumbnail;
                        const url = typeof original === "string" && original ? original : thumbnail;
                        const link = it?.link;
                        if (typeof url !== "string" || !url) continue;
                        if (!isAllowedBySources(link, allowedHostnames)) continue;
                        collected.push({
                            url,
                            source: "Web",
                            productData: undefined,
                        });
                    }
                } catch {
                    // ignore
                }
            }

            images = uniqBy(collected, (x) => x.url).slice(0, maxImages);
        } else {
            // No SerpApi key: fallback to official sources crawl
            images = await crawlOfficialSourcesForImages({
                sources,
                query,
                ean,
                skuToken,
            });
            images = uniqBy(images, (x) => x.url).slice(0, maxImages);
        }
    }

    // Final safety: normalize output shape for the UI.
    images = uniqBy(images, (x) => (typeof x === "string" ? x : x?.url || "")).filter(Boolean).slice(0, maxImages);

    return NextResponse.json({ images });
}

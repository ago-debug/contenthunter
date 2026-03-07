import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Simulate a browser request to avoid bot detection
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
};

interface ScrapedImage {
    id: string;
    url: string;
    title?: string;
    source?: string;
    productData?: {
        price?: string;
        description?: string;
        title?: string;
        brand?: string;
        category?: string;
        weight?: string;
        dimensions?: string;
        material?: string;
    };
}

/**
 * Scrape images from a given page URL that contains the SKU.
 * Tries multiple strategies: search the site using their own search form,
 * then extracts product images from the resulting page.
 */
/**
 * Scrape images from a given page URL that contains the SKU.
 * Tries multiple strategies: search the site using their own search form,
 * then extracts product images from the resulting page.
 */
async function scrapeImagesFromSource(sourceUrl: string, sku: string): Promise<ScrapedImage[]> {
    const found: ScrapedImage[] = [];
    let baseUrl: URL;
    try {
        baseUrl = new URL(sourceUrl);
    } catch {
        return found; // Invalid URL
    }
    const skuLower = sku.toLowerCase();

    // Funzione helper per estrarre da una singola pagina
    const scrapePage = async (url: string): Promise<ScrapedImage[]> => {
        try {
            console.log(`Scraping page: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    ...BROWSER_HEADERS,
                    'Referer': 'https://www.google.com/'
                },
                timeout: 10000,
                maxRedirects: 5
            });
            const $ = cheerio.load(response.data);
            return extractProductImages($, baseUrl.origin, sku);
        } catch (err: any) {
            console.error(`Error scraping ${url}:`, err.message);
            return [];
        }
    };

    // STRATEGY 1: DuckDuckGo Site Search (vero e proprio scraping della sorgente tramite motore di ricerca)
    try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:${baseUrl.hostname} ${sku}`)}`;
        const ddgResp = await axios.get(ddgUrl, { headers: BROWSER_HEADERS, timeout: 8000 });
        const $ddg = cheerio.load(ddgResp.data);

        const candidateLinks: string[] = [];
        $ddg('a.result__url, a.result__snippet, a.result__a').each((_, el) => {
            const href = $ddg(el).attr('href');
            if (href) {
                let actualLink = href;
                const match = href.match(/uddg=([^&]+)/);
                if (match) actualLink = decodeURIComponent(match[1]);
                else if (href.startsWith('//')) actualLink = 'https:' + href;

                if (actualLink.includes(baseUrl.hostname) && !candidateLinks.includes(actualLink)) {
                    candidateLinks.push(actualLink);
                }
            }
        });

        // Analizza le prime 2 pagine prodotto trovate
        for (const link of candidateLinks.slice(0, 2)) {
            const images = await scrapePage(link);
            if (images.length > 0) {
                found.push(...images);
            }
        }
    } catch (e) {
        console.warn(`DDG Scrape fallback failed for ${baseUrl.hostname}`);
    }

    // STRATEGY 2: Retailer Search Fallbacks
    if (found.length < 5) {
        const searchCandidates = [
            sourceUrl,
            `${baseUrl.origin}/search?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/catalogsearch/result/?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/s?k=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/?s=${encodeURIComponent(sku)}`,
            `https://www.google.com/search?q=${encodeURIComponent(sku + " " + baseUrl.hostname)}&tbm=isch`
        ];

        for (const url of searchCandidates) {
            if (!url) continue;
            const images = await scrapePage(url);
            if (images.length > 0) {
                found.push(...images);
                if (found.length > 10) break;
            }
        }
    }

    // Deduplicate by URL
    const unique = new Map();
    found.forEach(img => {
        if (!unique.has(img.url)) unique.set(img.url, img);
    });

    return Array.from(unique.values()).slice(0, 15);
}

/**
 * Scrape images from a single page URL (any domain). Used for DuckDuckGo global search results.
 */
async function scrapeImagesFromPage(pageUrl: string, query: string): Promise<ScrapedImage[]> {
    try {
        const response = await axios.get(pageUrl, {
            headers: { ...BROWSER_HEADERS, Referer: 'https://www.duckduckgo.com/' },
            timeout: 10000,
            maxRedirects: 5
        });
        let origin: string;
        try {
            origin = new URL(pageUrl).origin;
        } catch {
            return [];
        }
        const $ = cheerio.load(response.data);
        return extractProductImages($, origin, query);
    } catch (err: any) {
        console.warn(`Scrape page failed ${pageUrl}:`, err.message);
        return [];
    }
}

/**
 * DuckDuckGo global HTML search (no site:). Finds result links then scrapes each page for product images.
 * Works without SerpAPI or catalog sources.
 */
async function duckDuckGoGlobalSearch(query: string): Promise<ScrapedImage[]> {
    const found: ScrapedImage[] = [];
    try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const ddgResp = await axios.get(ddgUrl, { headers: BROWSER_HEADERS, timeout: 10000 });
        const $ddg = cheerio.load(ddgResp.data);

        const candidateLinks: string[] = [];
        $ddg('a.result__url, a.result__a, a[class*="result"]').each((_, el) => {
            const href = $ddg(el).attr('href');
            if (!href) return;
            let actualLink = href;
            const uddg = href.match(/uddg=([^&]+)/);
            if (uddg) actualLink = decodeURIComponent(uddg[1]);
            else if (href.startsWith('//')) actualLink = 'https:' + href;
            if (!actualLink.startsWith('http')) return;
            try {
                const u = new URL(actualLink);
                if (u.hostname.includes('duckduckgo.com')) return;
                if (!candidateLinks.includes(actualLink)) candidateLinks.push(actualLink);
            } catch { }
        });

        for (const link of candidateLinks.slice(0, 4)) {
            const images = await scrapeImagesFromPage(link, query);
            if (images.length > 0) found.push(...images);
            if (found.length >= 15) break;
        }

        const unique = new Map<string, ScrapedImage>();
        found.forEach(img => { if (!unique.has(img.url)) unique.set(img.url, img); });
        return Array.from(unique.values()).slice(0, 15);
    } catch (e: any) {
        console.warn("DuckDuckGo global search failed:", e?.message);
        return [];
    }
}

function extractProductImages($: cheerio.CheerioAPI, origin: string, sku: string): ScrapedImage[] {
    const images: ScrapedImage[] = [];
    const seen = new Set<string>();
    const skuLower = sku.toLowerCase();
    let isEcommerce = false;

    function addImage(url: string, title: string, sourceTag: string, isSchemaMatch = false) {
        if (!url) return;

        // Resolve relative URLs
        let fullUrl = url;
        if (url.startsWith('//')) fullUrl = 'https:' + url;
        else if (url.startsWith('/')) fullUrl = origin + url;
        else if (!url.startsWith('http')) fullUrl = origin + '/' + url;

        // Remove query parameters for strict matching (often cache keys)
        if (fullUrl.includes('?')) fullUrl = fullUrl.split('?')[0];

        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        // Scoring rules
        let score = 0;
        const urlLower = fullUrl.toLowerCase();
        const titleLower = title.toLowerCase();

        // Schema information is the absolute truth for ecommerce
        if (isSchemaMatch) score += 300;

        // Matching with SKU (if not ecommerce schema, SKU match is highly valuable)
        const hasSkuInUrl = urlLower.includes(skuLower);
        const hasSkuInTitle = titleLower.includes(skuLower);

        if (hasSkuInUrl) score += 100;
        if (hasSkuInTitle) score += 50;

        if (urlLower.includes('product') || urlLower.includes('catalog')) score += 20;
        if (urlLower.match(/\.(jpg|jpeg|png|webp|avif)$/i)) score += 10;

        // Penalize thumbnails
        if (urlLower.includes('thumb') || urlLower.includes('/100x') || urlLower.includes('/150x')) score -= 100;

        images.push({
            id: Math.random().toString(36).slice(2),
            url: fullUrl,
            title: title || sku,
            source: origin,
            // @ts-ignore - temporary score field for sorting
            score: score,
            productData: {
                title: title || sku
            }
        });
    }

    // Product metadata storage
    let extractedPrice = "";
    let extractedDescription = "";
    let extractedTitle = "";
    let extractedBrand = "";
    let extractedCategory = "";
    let extractedWeight = "";
    let extractedDimensions = "";
    let extractedMaterial = "";

    // ECOMMERCE RULE 1: Standard Schema JSON-LD Product
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const jsonText = $(el).text();
            if (jsonText.includes('"Product"') || jsonText.includes('schema.org/Product')) {
                isEcommerce = true;
            }
            const json = JSON.parse(jsonText);

            const findDataInJson = (obj: any) => {
                if (obj.description && !extractedDescription) extractedDescription = obj.description;
                if (obj.name && !extractedTitle) extractedTitle = obj.name;
                if (obj.brand) {
                    extractedBrand = typeof obj.brand === 'string' ? obj.brand : (obj.brand.name || '');
                }
                if (obj.category && !extractedCategory) {
                    extractedCategory = typeof obj.category === 'string' ? obj.category : (obj.category.name || '');
                }
                if (obj.weight) {
                    extractedWeight = typeof obj.weight === 'string' ? obj.weight : `${obj.weight.value || ''} ${obj.weight.unitText || obj.weight.unitCode || ''}`.trim();
                }
                if (obj.material && !extractedMaterial) {
                    extractedMaterial = typeof obj.material === 'string' ? obj.material : (obj.material.name || '');
                }
                if ((obj.width || obj.height || obj.depth) && !extractedDimensions) {
                    const w = obj.width ? (typeof obj.width === 'string' ? obj.width : `${obj.width.value || ''} ${obj.width.unitText || ''}`) : '';
                    const h = obj.height ? (typeof obj.height === 'string' ? obj.height : `${obj.height.value || ''} ${obj.height.unitText || ''}`) : '';
                    const d = obj.depth ? (typeof obj.depth === 'string' ? obj.depth : `${obj.depth.value || ''} ${obj.depth.unitText || ''}`) : '';
                    extractedDimensions = [w, h, d].filter(Boolean).join(' x ');
                }

                if (obj.offers) {
                    const price = obj.offers.price || (Array.isArray(obj.offers) && obj.offers[0]?.price);
                    const currency = obj.offers.priceCurrency || (Array.isArray(obj.offers) && obj.offers[0]?.priceCurrency) || '€';
                    if (price && !extractedPrice) extractedPrice = `${price} ${currency}`;
                }

                if (obj.image) {
                    if (Array.isArray(obj.image)) {
                        obj.image.forEach((img: any) => {
                            const url = typeof img === 'string' ? img : img.url;
                            if (url) addImage(url, obj.name || sku, 'JSON-LD', true);
                        });
                    } else {
                        const url = typeof obj.image === 'string' ? obj.image : obj.image.url;
                        if (url) addImage(url, obj.name || sku, 'JSON-LD', true);
                    }
                }
                if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                    obj['@graph'].forEach(findDataInJson);
                }
            };
            findDataInJson(json);
        } catch { }
    });

    // ECOMMERCE RULE 2: OpenGraph Product Tags
    const ogType = $('meta[property="og:type"]').attr('content');
    if (ogType === 'product' || ogType === 'product.item') {
        isEcommerce = true;
    }

    ['og:image', 'twitter:image'].forEach(meta => {
        const content = $(`meta[property="${meta}"], meta[name="${meta}"]`).attr('content');
        if (content) {
            addImage(content, sku, 'Meta', isEcommerce); // Se è ecommerce, vale come schema
        }
    });

    // Fallback extract description and price from meta
    if (!extractedDescription) {
        extractedDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    }
    if (!extractedTitle) {
        extractedTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    }
    if (!extractedPrice) {
        const pAmount = $('meta[property="product:price:amount"]').attr('content');
        const pCur = $('meta[property="product:price:currency"]').attr('content') || '€';
        if (pAmount) extractedPrice = `${pAmount} ${pCur}`;
    }
    if (!extractedBrand) {
        extractedBrand = $('meta[property="product:brand"]').attr('content') || $('meta[name="brand"]').attr('content') || '';
    }
    if (!extractedCategory) {
        extractedCategory = $('meta[property="product:category"]').attr('content') || '';
    }
    if (!extractedMaterial) {
        extractedMaterial = $('meta[property="product:material"]').attr('content') || '';
    }

    // GENERIC RULE 3: Match from DOM tags
    // Se è un sito e-commerce ma ha un layout anomalo, oppure non è ecommerce e dobbiamo basarci sullo SKU
    $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('srcset')?.split(' ')[0];
        const alt = $(el).attr('alt') || '';
        const title = $(el).attr('title') || '';

        if (!src) return;

        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');
        if ((width > 0 && width < 150) || (height > 0 && height < 150)) return;

        if (src.startsWith('data:') || src.includes('.svg') || src.includes('logo') || src.includes('icon')) return;

        const isSkuMatch = src.toLowerCase().includes(skuLower) || alt.toLowerCase().includes(skuLower) || title.toLowerCase().includes(skuLower);

        // Se è un eCommerce strutturato e abbiamo già delle info "sicure", ignoriamo le immaginine generiche
        // Se NON è e-commerce, accettiamo le immagini, ma quelle con lo SKU avranno un punteggio maggiore
        if (isEcommerce && !isSkuMatch) return;

        addImage(src, alt || title || sku, 'IMG', false);
    });

    // Populate extracted productData on all images to provide autocomplete info
    images.forEach(img => {
        img.productData = {
            title: img.productData?.title || extractedTitle,
            description: extractedDescription,
            price: extractedPrice,
            brand: extractedBrand,
            category: extractedCategory,
            weight: extractedWeight,
            dimensions: extractedDimensions,
            material: extractedMaterial
        };
    });

    // @ts-ignore
    return images.sort((a, b) => (b.score || 0) - (a.score || 0)).map(({ score, ...rest }) => rest);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const sources = searchParams.get('sources'); // Comma separated URLs
    const useShopping = searchParams.get('shopping') === 'true';

    if (!query) {
        return NextResponse.json({ images: [] });
    }

    try {
        const serpApiKey = process.env.SERPAPI_KEY;
        const allImages: ScrapedImage[] = [];

        // Parse source URLs
        const sourceList = sources
            ? sources.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        if (sourceList.length > 0) {
            // STRATEGY 1: Real web scraping of specified sources (catalog search URLs)
            const scrapePromises = sourceList.map(src => scrapeImagesFromSource(src, query));
            const results = await Promise.allSettled(scrapePromises);

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    allImages.push(...result.value);
                }
            }
        } else {
            // STRATEGY 1B: No catalog sources — use DuckDuckGo global search and scrape result pages
            const ddgImages = await duckDuckGoGlobalSearch(query);
            allImages.push(...ddgImages);
        }

        if (serpApiKey && useShopping) {
            try {
                const response = await axios.get(`https://serpapi.com/search.json`, {
                    params: { q: query, tbm: 'shop', api_key: serpApiKey, engine: 'google_shopping', hl: 'it', gl: 'it' }
                });
                const shoppingResults = (response.data.shopping_results || []).map((res: any) => ({
                    id: `shopping-${Math.random().toString(36).slice(2)}`,
                    url: res.thumbnail,
                    title: res.title,
                    source: res.source,
                    productData: {
                        price: res.extracted_price ? `${res.extracted_price} €` : res.price,
                        description: res.snippet || '',
                        title: res.title,
                        source: res.source
                    }
                }));
                allImages.push(...shoppingResults);
            } catch (err: any) {
                console.warn("Google Shopping extraction error:", err.message);
            }
        } else if (useShopping) {
            // STRATEGY 2B: Fallback Google Shopping Scraping with Cheerio
            try {
                const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=shop`;
                const response = await axios.get(url, { headers: BROWSER_HEADERS });
                const $ = cheerio.load(response.data);
                const shoppingResults: any[] = [];

                $(".sh-dgr__content").each((i, el) => {
                    if (i >= 10) return;
                    let imgUrl = $(el).find("img").attr("src");
                    if (!imgUrl || !imgUrl.startsWith("http")) {
                        imgUrl = $(el).find("img").attr("data-src") || "";
                    }
                    if (!imgUrl) return;

                    shoppingResults.push({
                        id: `cheerio-shop-${Math.random().toString(36).slice(2)}`,
                        url: imgUrl,
                        title: $(el).find("h3").text(),
                        source: "Google Shopping (Scraped)",
                        productData: {
                            title: $(el).find("h3").text(),
                            price: $(el).find("span[data-price]").text() || $(el).find(".a8Pemb").text() || "",
                            source: "Google Shopping (Scraped)"
                        }
                    });
                });
                allImages.push(...shoppingResults);
            } catch (err: any) {
                console.warn("Cheerio Google Shopping fallback error:", err.message);
            }
        }

        if (serpApiKey && allImages.length < 3) {
            // STRATEGY 3: SerpApi Google Images as supplement/fallback
            let finalQuery = query;
            if (sourceList.length > 0) {
                const domains = sourceList.map(s => {
                    try { return new URL(s).hostname; } catch { return s.replace(/https?:\/\//, '').split('/')[0]; }
                }).filter(Boolean);
                const siteFilters = domains.map(d => `site:${d}`).join(' OR ');
                finalQuery = `(${siteFilters}) ${query}`;
            }

            try {
                const response = await axios.get(`https://serpapi.com/search.json`, {
                    params: { q: finalQuery, tbm: 'isch', api_key: serpApiKey, engine: 'google_images', hl: 'it', gl: 'it' }
                });
                const serpImages = (response.data.images_results || []).map((img: any) => ({
                    id: img.position?.toString() || Math.random().toString(),
                    url: img.original || img.thumbnail,
                    title: img.title,
                    source: 'Google Images',
                }));
                allImages.push(...serpImages);
            } catch (err: any) {
                console.warn("SerpApi fallback error:", err.message);
            }
        }

        // Final filtering: exclude logos, favicons, tracking pixels, Google UI assets
        const filteredImages = allImages.filter(img => {
            const url = img.url.toLowerCase();
            const skip = [
                'favicon', '/logo', 'googlelogo', 'google.com/images', 'gstatic', '/icon',
                '1x1', 'pixel', 'tracking', 'beacon', 'badge', 'avatar', 'spacer',
                'data:image/svg', 'data:image/gif;base64', 'placeholder'
            ];
            if (skip.some(s => url.includes(s))) return false;
            if (url.startsWith('data:') && !url.includes('jpeg') && !url.includes('png') && !url.includes('webp')) return false;
            return true;
        });

        if (filteredImages.length > 0) {
            return NextResponse.json({ images: filteredImages.slice(0, 20) });
        }

        // FALLBACK: If everything failed, try a final broad Google Image scrape
        try {
            const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`;
            const resp = await axios.get(fallbackUrl, { headers: BROWSER_HEADERS });
            const $ = cheerio.load(resp.data);
            const fallbackResults: any[] = [];

            $('img').each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');
                if (!src || !src.startsWith('http') || i >= 15) return;
                const url = src.toLowerCase();
                if (url.includes('googlelogo') || url.includes('favicon') || url.includes('gstatic') || url.includes('/logo') || url.includes('/icon')) return;
                fallbackResults.push({
                    id: `fallback-${i}`,
                    url: src,
                    title: query,
                    source: 'Google (Fallback)'
                });
            });

            const filteredFallback = fallbackResults.filter(img => {
                const url = img.url.toLowerCase();
                if (['favicon', '/logo', 'google', 'gstatic', '1x1', 'pixel'].some(s => url.includes(s))) return false;
                return true;
            });
            if (filteredFallback.length > 0) {
                return NextResponse.json({ images: filteredFallback });
            }
        } catch (e) { }

        return NextResponse.json({
            images: [],
            message: "Nessun risultato trovato. Prova con una query diversa o configura SERPAPI_KEY."
        });

    } catch (error: any) {
        console.error("Web search API error:", error.message);
        return NextResponse.json({ images: [] }, { status: 500 });
    }
}

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
            const response = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 8000, maxRedirects: 5 });
            const $ = cheerio.load(response.data);
            return extractProductImages($, baseUrl.origin, sku);
        } catch { return []; }
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

    // STRATEGY 2: Common Search Paths (se lo scraping DDG fallisce o non trova abbastanza)
    if (found.length < 2) {
        const searchCandidates = [
            sourceUrl, // Prova l'URL esatto se fornito
            `${baseUrl.origin}/search?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/search?query=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/recherche?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/?s=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/catalogsearch/result/?q=${encodeURIComponent(sku)}`,
        ];

        for (const url of searchCandidates) {
            const images = await scrapePage(url);
            if (images.length > 0) {
                found.push(...images);
                break; // Ci fermiamo al primo che funziona
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
            score: score
        });
    }

    // ECOMMERCE RULE 1: Standard Schema JSON-LD Product
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const jsonText = $(el).text();
            if (jsonText.includes('"Product"') || jsonText.includes('schema.org/Product')) {
                isEcommerce = true;
            }
            const json = JSON.parse(jsonText);

            const findImages = (obj: any) => {
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
                    obj['@graph'].forEach(findImages);
                }
            };
            findImages(json);
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
            // STRATEGY 1: Real web scraping of specified sources
            const scrapePromises = sourceList.map(src => scrapeImagesFromSource(src, query));
            const results = await Promise.allSettled(scrapePromises);

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    allImages.push(...result.value);
                }
            }
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
        } else if (serpApiKey && allImages.length < 3) {
            // STRATEGY 3: SerpApi Google Images as supplement/fallback
            let finalQuery = query;
            if (sourceList.length > 0) {
                const domains = sourceList.map(s => {
                    try { return new URL(s).hostname; } catch { return s.replace(/https?:\/\//, '').split('/')[0]; }
                }).filter(Boolean);
                const siteFilters = domains.map(d => `site:${d}`).join(' OR ');
                finalQuery = `(${siteFilters}) ${query}`;
            }

            const response = await axios.get(`https://serpapi.com/search.json`, {
                params: { q: finalQuery, tbm: 'isch', api_key: serpApiKey, engine: 'google_images' }
            });
            const serpImages = (response.data.images_results || []).map((img: any) => ({
                id: img.position?.toString() || Math.random().toString(),
                url: img.original || img.thumbnail,
                title: img.title,
                source: 'Google Images',
            }));
            allImages.push(...serpImages);
        }

        if (allImages.length > 0) {
            return NextResponse.json({ images: allImages.slice(0, 20) });
        }

        // FALLBACK: high-quality mock results so UI stays functional
        await new Promise(resolve => setTimeout(resolve, 600));
        const mockResults = [
            { id: '1', url: `https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=800&auto=format&fit=crop`, title: query },
            { id: '2', url: `https://images.unsplash.com/photo-1493663284031-b7e3caef15a7?q=80&w=800&auto=format&fit=crop`, title: query },
            { id: '3', url: `https://images.unsplash.com/photo-1540574163026-643ea20ade25?q=80&w=800&auto=format&fit=crop`, title: query },
            { id: '4', url: `https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?q=80&w=800&auto=format&fit=crop`, title: query },
            { id: '5', url: `https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=800&auto=format&fit=crop`, title: query },
            { id: '6', url: `https://images.unsplash.com/photo-1523755231516-e43fd2e8dca5?q=80&w=800&auto=format&fit=crop`, title: query },
        ];
        return NextResponse.json({ images: mockResults, debug: { note: 'mock - configure SERPAPI_KEY or add source URLs' } });

    } catch (error: any) {
        console.error("Web search API error:", error.message);
        return NextResponse.json({ images: [] }, { status: 500 });
    }
}

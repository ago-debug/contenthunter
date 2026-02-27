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

    try {
        const baseUrl = new URL(sourceUrl);
        const skuLower = sku.toLowerCase();

        // Common site search patterns - try to navigate to a search page for the SKU
        const searchCandidates = [
            `${baseUrl.origin}/search?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/search?query=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/recherche?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/?s=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/catalogsearch/result/?q=${encodeURIComponent(sku)}`,
            `${baseUrl.origin}/index.php?route=product/search&search=${encodeURIComponent(sku)}`,
            `${sourceUrl}?search=${encodeURIComponent(sku)}`,
            `${sourceUrl}?q=${encodeURIComponent(sku)}`,
        ];

        for (const url of searchCandidates) {
            try {
                const response = await axios.get(url, {
                    headers: BROWSER_HEADERS,
                    timeout: 8000,
                    maxRedirects: 5,
                });

                const $ = cheerio.load(response.data);

                // STEP 1: Look for a link that directly takes us to the product page
                // Or check if we are ALREADY on a product page (e.g. search redirected us)
                const isProductPage =
                    $('meta[property="og:type"]').attr('content') === 'product' ||
                    $('script[type="application/ld+json"]').text().includes('"Product"') ||
                    response.request.res.responseUrl && response.request.res.responseUrl.includes(skuLower);

                if (isProductPage) {
                    const productImages = extractProductImages($, baseUrl.origin, sku);
                    if (productImages.length > 0) {
                        found.push(...productImages);
                        break;
                    }
                }

                let productPageUrl: string | null = null;
                $('a').each((_, el) => {
                    if (productPageUrl) return; // already found one

                    const href = $(el).attr('href') || '';
                    const text = $(el).text().toLowerCase();
                    const title = $(el).attr('title')?.toLowerCase() || '';

                    // Strong signals for a product link
                    const isProductLink =
                        (href.toLowerCase().includes(skuLower) || text.includes(skuLower) || title.includes(skuLower)) &&
                        !href.startsWith('#') &&
                        href.length > 2 &&
                        !href.includes('search') &&
                        !href.includes('category');

                    if (isProductLink) {
                        let fullHref = href;
                        if (href.startsWith('/')) fullHref = baseUrl.origin + href;
                        else if (!href.startsWith('http')) fullHref = baseUrl.origin + '/' + href;
                        productPageUrl = fullHref;
                    }
                });

                // STEP 2: If we found a product page link, scrape it for better images
                if (productPageUrl) {
                    try {
                        const productResp = await axios.get(productPageUrl, {
                            headers: BROWSER_HEADERS,
                            timeout: 8000,
                            maxRedirects: 5,
                        });
                        const $product = cheerio.load(productResp.data);
                        const productImages = extractProductImages($product, baseUrl.origin, sku);
                        if (productImages.length > 0) {
                            found.push(...productImages.slice(0, 15));
                            break; // Found results, stop trying other URLs
                        }
                    } catch { }
                }

                // STEP 3: Fall back to extracting from current page (search results)
                const images = extractProductImages($, baseUrl.origin, sku);

                if (images.length > 0) {
                    found.push(...images.slice(0, 10));
                    break; // Found results, stop trying other URLs
                }
            } catch {
                continue;
            }
        }
    } catch (err) {
        console.warn(`Could not scrape source ${sourceUrl}:`, err);
    }

    // Deduplicate by URL
    const unique = new Map();
    found.forEach(img => {
        if (!unique.has(img.url)) unique.set(img.url, img);
    });

    return Array.from(unique.values());
}

function extractProductImages($: cheerio.CheerioAPI, origin: string, sku: string): ScrapedImage[] {
    const images: ScrapedImage[] = [];
    const seen = new Set<string>();
    const skuLower = sku.toLowerCase();

    // Strategy 1: Look for JSON-LD Product images (usually high quality)
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).text());
            const findImages = (obj: any) => {
                if (obj.image) {
                    if (Array.isArray(obj.image)) {
                        obj.image.forEach((img: any) => {
                            const url = typeof img === 'string' ? img : img.url;
                            if (url) addImage(url, obj.name || sku, 'JSON-LD');
                        });
                    } else {
                        const url = typeof obj.image === 'string' ? obj.image : obj.image.url;
                        if (url) addImage(url, obj.name || sku, 'JSON-LD');
                    }
                }
                // Also check inside @graph for Yoast/other schemas
                if (obj['@graph'] && Array.isArray(obj['@graph'])) {
                    obj['@graph'].forEach(findImages);
                }
            };
            findImages(json);
        } catch { }
    });

    // Strategy 2: Look for Meta tags
    ['og:image', 'twitter:image', 'image'].forEach(meta => {
        const content = $(`meta[property="${meta}"], meta[name="${meta}"]`).attr('content');
        if (content) addImage(content, sku, 'Meta');
    });

    // Strategy 3: Standard img tags
    $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original') || $(el).attr('srcset')?.split(' ')[0];
        const alt = $(el).attr('alt') || '';
        const title = $(el).attr('title') || '';

        if (!src) return;

        // Skip icons/spacers and generic UI elements
        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');
        if ((width > 0 && width < 150) || (height > 0 && height < 150)) return;

        if (src.startsWith('data:') || src.includes('.svg') || src.includes('logo') || src.includes('icon') || src.includes('sprite')) return;
        if (src.includes('loading') || src.includes('banner') || src.includes('placeholder')) return;

        addImage(src, alt || title || sku, 'IMG');
    });

    function addImage(url: string, title: string, sourceTag: string) {
        if (!url) return;

        // Resolve relative URLs
        let fullUrl = url;
        if (url.startsWith('//')) fullUrl = 'https:' + url;
        else if (url.startsWith('/')) fullUrl = origin + url;
        else if (!url.startsWith('http')) fullUrl = origin + '/' + url;

        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        // Scoring
        let score = 0;
        const urlLower = fullUrl.toLowerCase();
        const titleLower = title.toLowerCase();

        if (urlLower.includes(skuLower)) score += 50;
        if (titleLower.includes(skuLower)) score += 30;
        if (urlLower.includes('product') || urlLower.includes('catalog')) score += 10;
        if (urlLower.match(/\.(jpg|jpeg|png|webp)$/i)) score += 5;

        // Penalize thumbnails
        if (urlLower.includes('thumb') || urlLower.includes('/100x') || urlLower.includes('/150x')) score -= 20;

        images.push({
            id: Math.random().toString(36).slice(2),
            url: fullUrl,
            title: title || sku,
            source: origin,
            // @ts-ignore - temporary score field for sorting
            score: score
        });
    }

    // Sort by score and remove the temporary field
    // @ts-ignore
    return images.sort((a, b) => (b.score || 0) - (a.score || 0)).map(({ score, ...rest }) => rest);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const sources = searchParams.get('sources'); // Comma separated URLs

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

        if (serpApiKey && allImages.length < 3) {
            // STRATEGY 2: SerpApi Google Images as supplement/fallback
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

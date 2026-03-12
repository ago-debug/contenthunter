// Scraping worker: coda ScrapePage -> fetch HTML -> estrazione prodotti (JSON-LD + HTML) -> ScrapeResult
//
// Flusso: 1) Localizza sitemap (robots.txt Sitemap: oppure /sitemap.xml)
//         2) Parsing sitemap (supporta Sitemap Index -> sitemap figlie)
//         3) Filtra URL da sitemap (solo pagine prodotto se sitemap mista)
//         4) Coda: URL in ScrapePage (stesso dominio, max 2000/job)
//         5) Request + estrazione: delay tra richieste (rate limit), 404 -> skipped
//         6) Dati preferiti: JSON-LD schema.org/Product, fallback selettori CSS
// Run: node scripts/scraping-worker.js

// Minimal polyfill for File to satisfy undici/OpenAI when running in plain Node
if (typeof global.File === "undefined") {
  global.File = class File {
    constructor(parts, name, options = {}) {
      this.parts = parts;
      this.name = name;
      this.type = options.type || "";
      this.lastModified = options.lastModified || Date.now();
    }
  };
}

const { PrismaClient } = require("@prisma/client");
const cheerio = require("cheerio");
const axios = require("axios");

const prisma = new PrismaClient();
const MAX_PAGES_PER_JOB = 2000; // limite di sicurezza per non scansionare siti infiniti
const DELAY_BETWEEN_REQUESTS_MS = 1500; // rate limiting: pausa tra una richiesta e l'altra (evita 403)
const SITEMAP_FETCH_TIMEOUT_MS = 10000;
const MAX_SITEMAP_INDEX_DEPTH = 3; // massima profondità sitemap index (es. index -> index -> prodotti)

// Pattern URL che indicano pagine prodotto (per filtrare sitemap miste blog/categorie/prodotti)
const PRODUCT_PATH_PATTERN = /\/?(p|prodotto|product|prodotti|products|shop\/[^/]+|item|articolo)(\/|$|\?)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeAbsoluteUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function normalizeUrlForCrawl(u) {
  if (!u) return "";
  try {
    const parsed = new URL(u);
    return parsed.origin + parsed.pathname + parsed.search;
  } catch {
    return u;
  }
}

function isRealProduct(p) {
  if (!p) return false;
  const hasId = !!(p.name && String(p.name).trim()) || !!(p.sku && String(p.sku).trim()) || !!(p.ean && String(p.ean).trim());
  const hasPrice = p.price != null && String(p.price).trim() !== "";
  const hasImage = !!(p.mainImage || (p.images && p.images.length > 0));
  const hasDesc = !!(p.description && String(p.description).trim());
  const hasProductUrl = !!(p.url && String(p.url).trim());
  return hasId && (hasPrice || hasImage || hasDesc) && hasProductUrl;
}

/** Estrae URL sitemap da robots.txt (righe Sitemap: https://...) */
async function getSitemapUrlsFromRobots(origin) {
  const out = [];
  try {
    const resp = await axios.get(`${origin}/robots.txt`, { responseType: "text", timeout: 5000 });
    if (resp.status !== 200 || !resp.data) return out;
    const text = String(resp.data);
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^Sitemap:\s*(https?:\/\/[^\s#]+)/i);
      if (m) out.push(m[1].trim());
    }
  } catch {
    // robots.txt assente o non leggibile
  }
  return out;
}

/**
 * Scarica un file sitemap XML e restituisce gli URL.
 * Se è un Sitemap Index (<sitemap><loc>...</loc></sitemap>), segue i link (fino a depth livelli).
 * Altrimenti estrae i <loc> delle pagine.
 * @param {string} sitemapUrl - URL del file sitemap
 * @param {string} origin - origin consentita (solo URL stesso dominio)
 * @param {Set<string>} skipExt - regex per estensioni da escludere
 * @param {number} depth - profondità corrente (sitemap index)
 * @returns {Promise<string[]>} - lista URL normalizzate
 */
async function fetchSitemapAndCollectUrls(sitemapUrl, origin, skipExt, depth = 0) {
  const urls = [];
  if (depth > MAX_SITEMAP_INDEX_DEPTH) return urls;
  try {
    const resp = await axios.get(sitemapUrl, { responseType: "text", timeout: SITEMAP_FETCH_TIMEOUT_MS });
    if (resp.status !== 200 || !resp.data) return urls;
    const xml = String(resp.data);
    const $ = cheerio.load(xml, { xmlMode: true });

    const sitemapLocs = [];
    $("sitemap loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) sitemapLocs.push(loc);
    });

    if (sitemapLocs.length > 0) {
      for (const loc of sitemapLocs) {
        try {
          const childUrl = new URL(loc);
          if (childUrl.origin !== origin) continue;
          const sub = await fetchSitemapAndCollectUrls(loc, origin, skipExt, depth + 1);
          urls.push(...sub);
        } catch {
          // ignora sitemap figlia non valida
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
        // ignora
      }
    });
  } catch {
    // sitemap non scaricabile (404, timeout, ecc.)
  }
  return urls;
}

/** Restituisce true se l'URL sembra una pagina prodotto (per filtrare sitemap miste). */
function looksLikeProductUrl(urlStr) {
  try {
    const path = new URL(urlStr).pathname || "";
    return PRODUCT_PATH_PATTERN.test(path);
  } catch {
    return false;
  }
}

function basicExtractFromHtml(html, url) {
  const $ = cheerio.load(html);

  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").first().text() ||
    $("h1").first().text() ||
    "";

  const categoryName =
    $("nav [aria-current='page']").last().text().trim() ||
    $(".breadcrumb li").last().text().trim() ||
    "";

  const products = [];

  // 1) Structured data JSON-LD (schema.org/Product, ItemList, @graph)
  //    Supporta strutture usate da Shopify, WooCommerce, Magento, PrestaShop:
  //    - Oggetti singoli @type: "Product"
  //    - Array di nodi
  //    - @graph con Product all'interno
  //    - ItemList/CollectionPage con itemListElement -> Product

  function nodeIsProduct(n) {
    if (!n) return false;
    const t = n["@type"];
    if (!t) return false;
    if (Array.isArray(t)) {
      return t.some((x) => String(x).toLowerCase().includes("product"));
    }
    return String(t).toLowerCase().includes("product");
  }

  function collectProductsFromNode(node, pageUrl) {
    if (!node) return;

    // @graph: tipico di Shopify e altri temi moderni
    if (Array.isArray(node["@graph"])) {
      for (const g of node["@graph"]) {
        collectProductsFromNode(g, pageUrl);
      }
    }

    // ItemList o CollectionPage con itemListElement che contengono Product
    if (
      (node["@type"] === "ItemList" || node["@type"] === "CollectionPage") &&
      Array.isArray(node.itemListElement)
    ) {
      for (const item of node.itemListElement) {
        const prod = item.item || item;
        if (prod && nodeIsProduct(prod)) {
          const normalized = normalizeSchemaProduct(prod, pageUrl);
          products.push(normalized);
        }
      }
    }

    // Nodo singolo Product (anche se arriva da @graph o array)
    if (nodeIsProduct(node)) {
      const normalized = normalizeSchemaProduct(node, pageUrl);
      products.push(normalized);
    }
  }

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    if (Array.isArray(json)) {
      for (const node of json) {
        collectProductsFromNode(node, url);
      }
    } else {
      collectProductsFromNode(json, url);
    }
  });

  const productSelectors = [
    "[itemtype*='Product']",
    ".product",
    ".product-item",
    ".product-card",
    ".productGrid .grid-item",
  ];

  const seen = new Set();

  $(productSelectors.join(",")).each((_, el) => {
    const block = $(el);
    const name =
      block.find("[itemprop='name']").first().text().trim() ||
      block.find("h2, h3").first().text().trim();

    const priceText =
      block.find("[itemprop='price']").first().text().trim() ||
      block.find(".price, .product-price").first().text().trim();

    const attributes = {};

    block.find("table tr").each((_, row) => {
      const cells = $(row).find("th,td");
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[cells.length - 1]).text().trim();
        if (key && value) attributes[key] = value;
      }
    });

    block.find("li").each((_, li) => {
      const txt = $(li).text().trim();
      const idx = txt.indexOf(":");
      if (idx > 0) {
        const key = txt.slice(0, idx).trim();
        const value = txt.slice(idx + 1).trim();
        if (key && value && !attributes[key]) attributes[key] = value;
      }
    });

    let sku = null;
    let ean = null;

    const fullText = block.text();
    const skuMatch = fullText.match(/\bSKU[:\s#]*([A-Za-z0-9\-_.]+)/i);
    if (skuMatch && skuMatch[1]) sku = skuMatch[1].trim();
    const eanMatch = fullText.match(/\bEAN[:\s#]*([0-9]{8,14})/i);
    if (eanMatch && eanMatch[1]) ean = eanMatch[1].trim();

    if (!sku) {
      for (const [k, v] of Object.entries(attributes)) {
        if (/sku|codice|referenza/i.test(k) && v) {
          sku = String(v).trim();
          break;
        }
      }
    }
    if (!ean) {
      for (const [k, v] of Object.entries(attributes)) {
        if (/ean|barcode|gtin/i.test(k) && v) {
          const digits = String(v).replace(/[^\d]/g, "");
          if (digits.length >= 8 && digits.length <= 14) {
            ean = digits;
            break;
          }
        }
      }
    }

    // Raccogli più immagini dal blocco prodotto (thumbnail + immagini principali)
    const images = [];
    block.find("img").each((_, img) => {
      const src = $(img).attr("src");
      if (!src) return;
      const abs = makeAbsoluteUrl(src, url) || src;
      if (!abs) return;
      if (!images.includes(abs)) images.push(abs);
    });

    const productUrl = block.find("a").first().attr("href") || undefined;

    const absUrl = makeAbsoluteUrl(productUrl, url);
    const mainImg = images.length > 0 ? images[0] : null;

    const key = `${absUrl || ""}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Solo blocchi che sembrano prodotti: almeno (nome/sku/ean) e (prezzo/link/immagine)
    const hasId = !!(name || sku || ean);
    const hasData =
      !!(priceText && priceText.trim()) ||
      !!absUrl ||
      !!mainImg;
    if (!hasId || !hasData) return;

    products.push({
      url: absUrl,
      name: name || null,
      price: priceText || null,
      mainImage: mainImg,
      images,
      sku,
      ean,
      attributes,
    });
  });

  // Non aggiungere immagini generiche come "prodotti" (logo, banner) — solo dati strutturati o blocchi .product

  return {
    url,
    title: title.trim() || null,
    categoryName: categoryName || null,
    products,
  };
}

function normalizeSchemaProduct(prod, baseUrl) {
  // Alcune piattaforme (es. Shopify) possono omettere l'URL nel JSON-LD Product.
  // In quel caso useremo l'URL della pagina come fallback (verrà passato in baseUrl).
  const urlFromData = prod.url || (prod.offers && prod.offers.url) || null;
  const url = makeAbsoluteUrl(urlFromData, baseUrl) || baseUrl || null;
  const images = [];
  if (Array.isArray(prod.image)) {
    for (const img of prod.image) {
      const abs = makeAbsoluteUrl(img, baseUrl);
      if (abs) images.push(abs);
    }
  } else if (prod.image) {
    const abs = makeAbsoluteUrl(prod.image, baseUrl);
    if (abs) images.push(abs);
  }

  const offers = prod.offers || {};
  const attrs = {};
  if (offers.itemCondition) attrs["itemCondition"] = offers.itemCondition;
  if (offers.availability) attrs["availability"] = offers.availability;
  if (offers.priceCurrency) attrs["priceCurrency"] = offers.priceCurrency;
  if (offers.priceValidUntil) attrs["priceValidUntil"] = offers.priceValidUntil;

  // additionalProperty (PropertyValue[]) è usato spesso per attributi custom (taglia, colore, materiale, ecc.)
  if (Array.isArray(prod.additionalProperty)) {
    for (const prop of prod.additionalProperty) {
      const key = prop.name || prop.propertyID;
      const value = prop.value;
      if (!key || value == null) continue;
      const k = String(key).trim();
      if (!k) continue;
      if (attrs[k] == null) attrs[k] = String(value);
    }
  }

  return {
    url,
    name: prod.name || null,
    description: prod.description || null,
    price: offers.price || prod.price || null,
    mainImage: images[0] || null,
    images,
    sku: prod.sku || prod.skuId || null,
    ean:
      prod.gtin13 ||
      prod.gtin ||
      prod.gtin14 ||
      prod.gtin12 ||
      prod.gtin8 ||
      null,
    brand: prod.brand?.name || prod.brand || null,
    attributes: attrs,
  };
}

// Restituisce la prossima pagina da processare per il job \"attivo\" (in pending/running),
// garantendo che i job vengano eseguiti in serie (uno dopo l'altro).
async function getNextPageForJobInSeries() {
  // Trova il job più vecchio ancora attivo
  const job = await prisma.scrapeJob.findFirst({
    where: {
      status: {
        in: ["pending", "running"],
      },
    },
    orderBy: { id: "asc" },
    include: {
      spider: true,
    },
  });

  if (!job) {
    return null;
  }

  // Trova la prossima pagina per questo job
  let page = await prisma.scrapePage.findFirst({
    where: {
      jobId: job.id,
      OR: [
        { status: "pending" },
        { status: "error", retryCount: { lt: 1 } },
      ],
    },
    orderBy: { id: "asc" },
  });

  // Se non ci sono più pagine pendenti per questo job, finalizzalo e passa al prossimo
  if (!page) {
    const agg = await prisma.scrapePage.groupBy({
      by: ["status"],
      where: { jobId: job.id },
      _count: { _all: true },
    });
    let total = 0;
    let done = 0;
    let error = 0;
    for (const row of agg) {
      total += row._count._all;
      if (row.status === "done") done += row._count._all;
      if (row.status === "error") error += row._count._all;
    }
    const hasPending = agg.some((r) => r.status === "pending" || r.status === "running");
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        totalPages: total,
        successCount: done,
        errorCount: error,
        status: hasPending ? "running" : "done",
        finishedAt: hasPending ? null : new Date(),
      },
    });
    // Nessuna pagina per questo job: prova con il prossimo job
    return await getNextPageForJobInSeries();
  }

  if (page.status === "error") {
    await prisma.scrapePage.update({
      where: { id: page.id },
      data: { status: "pending", error: null, retryCount: (page.retryCount || 0) + 1 },
    });
    page = { ...page, status: "pending" };
  }

  return { job, page };
}

async function processOnePage() {
  const data = await getNextPageForJobInSeries();
  if (!data) return false;

  const { job, page } = data;
  const spider = job.spider;
  const url = page.url;

  console.log(`[worker] Processing page ${page.id} for job ${job.id}: ${url}`);

  if (job.status === "pending") {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date() },
    });
  }

  await prisma.scrapePage.update({
    where: { id: page.id },
    data: { status: "running" },
  });

  let statusCode = null;
  try {
    const resp = await axios.get(url, { responseType: "text", timeout: 15000 });
    statusCode = resp.status;

    if (statusCode === 404) {
      await prisma.scrapePage.update({
        where: { id: page.id },
        data: { status: "skipped", statusCode: 404, error: "Page not found (404)" },
      });
      const agg = await prisma.scrapePage.groupBy({
        by: ["status"],
        where: { jobId: job.id },
        _count: { _all: true },
      });
      let total = 0;
      let done = 0;
      let error = 0;
      for (const row of agg) {
        total += row._count._all;
        if (row.status === "done") done += row._count._all;
        if (row.status === "error") error += row._count._all;
      }
      const hasPending = agg.some((r) => r.status === "pending" || r.status === "running");
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          totalPages: total,
          successCount: done,
          errorCount: error,
          status: hasPending ? "running" : "done",
          finishedAt: hasPending ? null : new Date(),
        },
      });
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
      return true;
    }

    const html = resp.data || "";

    // Sulla pagina di partenza: 1) Leggi robots.txt per Sitemap: 2) Sitemap index + prodotti 3) Filtra URL prodotto
    const sitemapLinks = new Set();
    if (spider.startUrl) {
      try {
        const start = new URL(spider.startUrl);
        const isStartPage =
          normalizeUrlForCrawl(spider.startUrl) === normalizeUrlForCrawl(url);
        const skipExt = /\.(pdf|zip|rar|jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ico|mp4|webm)(\?|$)/i;

        if (isStartPage) {
          const sitemapUrlsToFetch = new Set();
          // Da robots.txt (percorso quasi sempre dichiarato)
          const fromRobots = await getSitemapUrlsFromRobots(start.origin);
          fromRobots.forEach((u) => sitemapUrlsToFetch.add(u));
          // Fallback: path comuni se robots non ha Sitemap
          if (sitemapUrlsToFetch.size === 0) {
            [
              "/sitemap.xml",
              "/sitemap_index.xml",
              "/sitemap-index.xml",
              "/sitemap1.xml",
              "/sitemap-products.xml",
              "/sitemap_product.xml",
              "/product-sitemap.xml",
            ].forEach((path) => sitemapUrlsToFetch.add(`${start.origin}${path}`));
          }

          for (const sitemapUrl of sitemapUrlsToFetch) {
            const collected = await fetchSitemapAndCollectUrls(
              sitemapUrl,
              start.origin,
              skipExt
            );
            const isProductSitemap = /product|prodotti|item|shop/i.test(sitemapUrl);
            for (const loc of collected) {
              if (!loc) continue;
              if (isProductSitemap) {
                sitemapLinks.add(loc);
              } else if (looksLikeProductUrl(loc)) {
                sitemapLinks.add(loc);
              }
            }
            await sleep(500); // breve pausa tra una sitemap e l'altra
          }
        }
      } catch {
        // startUrl non valida, ignora sitemap
      }
    }

    const extracted = basicExtractFromHtml(html, url);

    await prisma.scrapeResult.create({
      data: {
        jobId: job.id,
        url,
        statusCode,
        rawHtml: html,
        extracted,
      },
    });

    // Scoperta link: stesso sito (dominio dello startUrl) per scansionare tutte le pagine
    const $ = cheerio.load(html);
    const base = new URL(url);
    const startOrigin = spider.startUrl ? new URL(spider.startUrl).origin : base.origin;

    const productUrls = new Set();
    if (extracted && Array.isArray(extracted.products)) {
      for (const p of extracted.products) {
        if (p && p.url) productUrls.add(p.url);
      }
    }

    const skipExtension = /\.(pdf|zip|rar|jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ico|mp4|webm)(\?|$)/i;
    const sameSiteLinks = new Set();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const abs = makeAbsoluteUrl(href, base.toString());
      if (!abs) return;
      if (skipExtension.test(abs)) return;
      try {
        if (new URL(abs).origin !== startOrigin) return;
        sameSiteLinks.add(normalizeUrlForCrawl(abs));
      } catch {
        // ignore invalid URL
      }
    });

    const productAbs = [...productUrls].map((href) => makeAbsoluteUrl(href, base.toString())).filter(Boolean);
    const toEnqueue = new Set(
      [
        ...productAbs.map(normalizeUrlForCrawl),
        ...sameSiteLinks,
        ...sitemapLinks,
      ].filter(Boolean)
    );

    // Evita duplicati: URL già in coda o già processate per questo job
    const existing = await prisma.scrapePage.findMany({
      where: { jobId: job.id },
      select: { url: true },
    });
    const existingNormalized = new Set(existing.map((r) => normalizeUrlForCrawl(r.url)));
    const toAdd = [...toEnqueue].filter((link) => link && !existingNormalized.has(link));

    const currentTotal = existing.length;
    const canAdd = Math.max(0, MAX_PAGES_PER_JOB - currentTotal);
    const toInsert = toAdd.slice(0, canAdd);

    for (const link of toInsert) {
      try {
        await prisma.scrapePage.create({
          data: {
            jobId: job.id,
            url: link,
            status: "pending",
          },
        });
      } catch (e) {
        // duplicate or DB error, skip
      }
    }

    await prisma.scrapePage.update({
      where: { id: page.id },
      data: { status: "done", statusCode },
    });

    // Update job counters
    const agg = await prisma.scrapePage.groupBy({
      by: ["status"],
      where: { jobId: job.id },
      _count: { _all: true },
    });

    let total = 0;
    let done = 0;
    let error = 0;
    for (const row of agg) {
      total += row._count._all;
      if (row.status === "done") done += row._count._all;
      if (row.status === "error") error += row._count._all;
    }

    const hasPending = agg.some((r) => r.status === "pending" || r.status === "running");

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        totalPages: total,
        successCount: done,
        errorCount: error,
        status: hasPending ? "running" : "done",
        finishedAt: hasPending ? null : new Date(),
      },
    });

    await sleep(DELAY_BETWEEN_REQUESTS_MS); // rate limiting: pausa tra richieste
  } catch (err) {
    console.error("[worker] Error processing page", page.id, err);
    await prisma.scrapePage.update({
      where: { id: page.id },
      data: {
        status: "error",
        statusCode,
        error: err && err.message ? String(err.message) : "Unknown error",
      },
    });
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        errorCount: (job.errorCount || 0) + 1,
      },
    });
  }

  return true;
}

async function main() {
  console.log("[worker] Scraping worker started");
  while (true) {
    const didWork = await processOnePage();
    if (!didWork) {
      await sleep(3000);
    }
  }
}

main().catch((e) => {
  console.error("[worker] Fatal error", e);
  process.exit(1);
});


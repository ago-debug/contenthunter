// Simple scraping worker that consumes ScrapePage queue and fills ScrapeResult
// Run with: node scripts/scraping-worker.js

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

  // 1) Structured data JSON-LD (schema.org/Product, ItemList)
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const nodes = Array.isArray(json) ? json : [json];
    for (const node of nodes) {
      if (!node) continue;
      // ItemList of products
      if (
        (node["@type"] === "ItemList" || node["@type"] === "CollectionPage") &&
        Array.isArray(node.itemListElement)
      ) {
        for (const item of node.itemListElement) {
          const prod = item.item || item;
          if (!prod) continue;
          if (prod["@type"] === "Product") {
            const normalized = normalizeSchemaProduct(prod, url);
            if (isRealProduct(normalized)) products.push(normalized);
          }
        }
        continue;
      }
      // Single Product (solo se sembra un prodotto vero, non Organization/Brand)
      if (node["@type"] === "Product") {
        const normalized = normalizeSchemaProduct(node, url);
        if (isRealProduct(normalized)) products.push(normalized);
      }
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

    const imgSrc = block.find("img").first().attr("src") || undefined;
    const productUrl = block.find("a").first().attr("href") || undefined;

    const absUrl = makeAbsoluteUrl(productUrl, url);
    const absImg = makeAbsoluteUrl(imgSrc, url) || imgSrc || null;

    const key = `${absUrl || ""}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Solo blocchi che sembrano prodotti: almeno (nome/sku/ean) e (prezzo/link/immagine)
    const hasId = !!(name || sku || ean);
    const hasData = !!(priceText && priceText.trim()) || !!absUrl || !!absImg;
    if (!hasId || !hasData) return;

    products.push({
      url: absUrl,
      name: name || null,
      price: priceText || null,
      mainImage: absImg,
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
  const url = makeAbsoluteUrl(prod.url || prod.offers?.url || null, baseUrl);
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

  return {
    url,
    name: prod.name || null,
    description: prod.description || null,
    price: offers.price || prod.price || null,
    mainImage: images[0] || null,
    images,
    sku: prod.sku || null,
    ean: prod.gtin13 || prod.gtin || null,
    brand: prod.brand?.name || prod.brand || null,
    attributes: attrs,
  };
}

async function processOnePage() {
  // Prendi una pagina pending oppure una in errore da ritentare (max 1 retry)
  let page = await prisma.scrapePage.findFirst({
    where: {
      OR: [
        { status: "pending" },
        { status: "error", retryCount: { lt: 1 } },
      ],
    },
    orderBy: { id: "asc" },
    include: {
      job: {
        include: {
          spider: true,
        },
      },
    },
  });

  if (!page) return false;

  if (page.status === "error") {
    await prisma.scrapePage.update({
      where: { id: page.id },
      data: { status: "pending", error: null, retryCount: (page.retryCount || 0) + 1 },
    });
    page = { ...page, status: "pending" };
  }

  const job = page.job;
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
    const resp = await axios.get(url, { responseType: "text" });
    statusCode = resp.status;
    const html = resp.data || "";

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
    const MAX_PAGES_PER_JOB = 2000;

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
    const toEnqueue = new Set([
      ...productAbs.map(normalizeUrlForCrawl),
      ...sameSiteLinks,
    ].filter(Boolean));

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


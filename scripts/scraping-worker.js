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

    if (!name && !absUrl && !absImg) return;

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

  if (products.length === 0) {
    $("img")
      .slice(0, 24)
      .each((_, el) => {
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
    title: title.trim() || null,
    categoryName: categoryName || null,
    products,
  };
}

async function processOnePage() {
  const page = await prisma.scrapePage.findFirst({
    where: { status: "pending" },
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

    // Simple link discovery: follow product URLs & pagination-like links
    const $ = cheerio.load(html);
    const links = new Set();

    const base = new URL(url);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = makeAbsoluteUrl(href, base.toString());
      if (!abs) return;
      // Same host only
      try {
        const u = new URL(abs);
        if (u.host !== base.host) return;
      } catch {
        return;
      }
      links.add(abs);
    });

    const productUrls = new Set();
    if (extracted && Array.isArray(extracted.products)) {
      for (const p of extracted.products) {
        if (p && p.url) productUrls.add(p.url);
      }
    }

    const toEnqueue = new Set([...links, ...productUrls]);

    // Enqueue new pages
    for (const link of toEnqueue) {
      try {
        await prisma.scrapePage.create({
          data: {
            jobId: job.id,
            url: link,
            status: "pending",
          },
        });
      } catch (e) {
        // likely duplicate entry, ignore
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


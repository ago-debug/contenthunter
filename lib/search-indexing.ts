/**
 * Automazioni indicizzazione: IndexNow (Bing, Yandex, motori compatibili), ping sitemap legacy.
 * Google Search richiede Search Console / crawl naturale — qui si accelerano notifiche supportate pubblicamente.
 */

import axios from "axios";
import { prisma } from "@/lib/prisma";
import { sanitizeSeoGeoHubInput } from "@/lib/seo-geo-hub-schema";

const INDEXNOW_API = "https://api.indexnow.org/IndexNow";

function normalizeHost(raw: string): string {
    return raw
        .trim()
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        .toLowerCase();
}

/** Ping classico (non garantisce crawl; ancora usato da molti CMS). */
export async function pingSitemapToSearchEngines(sitemapUrl: string): Promise<void> {
    const u = sitemapUrl.trim();
    if (!/^https?:\/\//i.test(u)) return;
    const enc = encodeURIComponent(u);
    await Promise.allSettled([
        axios.get(`https://www.google.com/ping?sitemap=${enc}`, { timeout: 15000, validateStatus: () => true }),
        axios.get(`https://www.bing.com/ping?sitemap=${enc}`, { timeout: 15000, validateStatus: () => true }),
    ]);
}

export async function submitIndexNow(params: {
    host: string;
    key: string;
    keyLocation?: string;
    urlList: string[];
}): Promise<{ ok: boolean; status?: number }> {
    const host = normalizeHost(params.host);
    const key = params.key.trim();
    const urlList = params.urlList.filter((x) => /^https?:\/\//i.test(x)).slice(0, 10000);
    if (!host || !key || urlList.length === 0) return { ok: false };

    const body: Record<string, unknown> = {
        host,
        key,
        urlList,
    };
    if (params.keyLocation?.trim()) {
        body.keyLocation = params.keyLocation.trim();
    }

    const res = await axios.post(INDEXNOW_API, body, {
        headers: { "Content-Type": "application/json; charset=utf-8" },
        timeout: 20000,
        validateStatus: () => true,
    });
    return { ok: res.status === 200 || res.status === 202, status: res.status };
}

/**
 * Dopo push Woo/Presta: IndexNow + ping sitemap se abilitati nel SEO & GEO Hub.
 */
export async function runAutoIndexingAfterChannelPush(
    companyId: number,
    productUrls: string[],
    logPrefix = "[auto-indexing]"
): Promise<void> {
    const urls = productUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) return;

    const row = await prisma.company.findUnique({
        where: { id: companyId },
        select: { seoGeoHub: true },
    });
    if (!row?.seoGeoHub) return;

    const hub = sanitizeSeoGeoHubInput(row.seoGeoHub);
    const ix = hub.indexing;
    if (!ix?.autoSubmitOnChannelSync) return;

    try {
        if (ix.pingSitemapOnSync && ix.sitemapUrl?.trim()) {
            await pingSitemapToSearchEngines(ix.sitemapUrl.trim());
        }
    } catch (e) {
        console.warn(logPrefix, "sitemap ping", e);
    }

    try {
        if (
            ix.indexNowEnabled &&
            ix.indexNowKey?.trim() &&
            ix.indexNowHost?.trim() &&
            urls.length > 0
        ) {
            await submitIndexNow({
                host: ix.indexNowHost,
                key: ix.indexNowKey,
                keyLocation: ix.indexNowKeyLocation?.trim() || undefined,
                urlList: urls.slice(0, 100),
            });
        }
    } catch (e) {
        console.warn(logPrefix, "indexnow", e);
    }
}

export function buildPrestaCanonicalProductUrl(shopUrl: string, prestashopId: number): string {
    const base = shopUrl.trim().replace(/\/+$/, "");
    return `${base}/index.php?id_product=${prestashopId}&controller=product`;
}

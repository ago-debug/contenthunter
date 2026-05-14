import axios from "axios";
import { prisma } from "@/lib/prisma";

export type RecommendedProductChip = {
    sku: string;
    title: string;
    productId: number | null;
    /** Su storefront Woo (embed): link al prodotto o fallback ricerca. In app null. */
    storeUrl: string | null;
};

/**
 * Arricchisce gli SKU consigliati dal modello con titolo IT da DB e, se richiesto, permalink WooCommerce.
 */
export async function enrichPersonalShopperRecommendedProducts(
    companyId: number,
    recommendedSkus: string[],
    options: { resolveWooUrls: boolean }
): Promise<RecommendedProductChip[]> {
    const skus = Array.from(new Set(recommendedSkus.map((s) => String(s).trim()).filter(Boolean))).slice(
        0,
        40
    );
    if (skus.length === 0) return [];

    const rows = await prisma.product.findMany({
        where: { companyId, sku: { in: skus } },
        select: {
            id: true,
            sku: true,
            texts: { where: { language: "it" }, take: 1, select: { title: true } },
        },
    });
    const bySku = new Map(rows.map((r) => [r.sku, r]));

    let woo:
        | {
              domain: string;
              key: string;
              secret: string;
          }
        | undefined;
    let domainOnly: string | null = null;
    if (options.resolveWooUrls) {
        const c = await prisma.company.findUnique({
            where: { id: companyId },
            select: { wooDomain: true, wooConsumerKey: true, wooConsumerSecret: true },
        });
        if (c?.wooDomain?.trim()) {
            domainOnly = c.wooDomain.replace(/\/+$/, "");
        }
        if (
            c?.wooDomain?.trim() &&
            c.wooConsumerKey?.trim() &&
            c.wooConsumerSecret?.trim()
        ) {
            woo = {
                domain: c.wooDomain.replace(/\/+$/, ""),
                key: c.wooConsumerKey.trim(),
                secret: c.wooConsumerSecret.trim(),
            };
        }
    }

    const permalinkBySku = new Map<string, string | null>();
    if (woo) {
        await Promise.all(
            skus.map(async (sku) => {
                const url = await fetchWooPermalinkForSku(woo!, sku);
                permalinkBySku.set(sku, url);
            })
        );
    }

    return skus.map((sku) => {
        const row = bySku.get(sku);
        const title = row?.texts[0]?.title?.trim() || sku;
        let storeUrl: string | null = null;
        if (options.resolveWooUrls) {
            if (woo) {
                storeUrl = permalinkBySku.get(sku) ?? null;
            }
            if (!storeUrl && domainOnly) {
                storeUrl = `${domainOnly}/?post_type=product&s=${encodeURIComponent(sku)}`;
            }
        }
        return {
            sku,
            title,
            productId: row?.id ?? null,
            storeUrl,
        };
    });
}

async function fetchWooPermalinkForSku(
    woo: { domain: string; key: string; secret: string },
    sku: string
): Promise<string | null> {
    try {
        const res = await axios.get(`${woo.domain}/wp-json/wc/v3/products`, {
            params: { sku },
            auth: { username: woo.key, password: woo.secret },
            timeout: 12000,
            validateStatus: (s) => s < 500,
        });
        const arr = Array.isArray(res.data) ? res.data : [];
        const p = arr[0];
        return p?.permalink ? String(p.permalink) : null;
    } catch {
        return null;
    }
}

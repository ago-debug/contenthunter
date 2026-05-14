import { NextResponse } from "next/server";
import axios from "axios";
import {
    dedupeWooImagesBySrc,
    mergeErpUrlsIntoWooImages,
    normalizeImageUrlForDedupe,
    sha256Buffer,
} from "@/lib/ecommerce-image-sync";

export const maxDuration = 300;

const wooAxiosTimeout = 120000;

async function hashWooImageEntry(
    img: any,
    axiosForBin: ReturnType<typeof axios.create>
): Promise<{ img: any; hash: string | null }> {
    const src = img?.src;
    if (!src || typeof src !== "string") return { img, hash: null };
    try {
        const r = await axiosForBin.get(src, { responseType: "arraybuffer" });
        const ct = String(r.headers["content-type"] || "");
        if (!ct.startsWith("image/")) return { img, hash: null };
        const buf = Buffer.from(r.data);
        if (buf.length < 24) return { img, hash: null };
        return { img, hash: sha256Buffer(buf) };
    } catch {
        return { img, hash: null };
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    const { domain, key, secret, product, publicOrigin, maxGalleryImages } = body as {
        domain: string;
        key: string;
        secret: string;
        product: any;
        publicOrigin?: string;
        maxGalleryImages?: number;
    };

    if (!domain || !key || !secret || !product?.sku) {
        return NextResponse.json({ error: "Dati mancanti (domain, key, secret, product.sku)" }, { status: 400 });
    }

    const origin = (publicOrigin || "").trim() || new URL(req.url).origin;
    const maxGal = Math.min(50, Math.max(1, Number(maxGalleryImages) || 30));

    const auth = { username: key, password: secret };

    try {
        const sku = String(product.sku).trim();
        const existingRes = await axios.get(`${domain}/wp-json/wc/v3/products`, {
            params: { sku, per_page: 1 },
            auth,
            timeout: wooAxiosTimeout,
            validateStatus: () => true,
        });
        if (existingRes.status >= 400) {
            return NextResponse.json(
                { error: "Errore lettura WooCommerce (SKU)", details: existingRes.data },
                { status: 502 }
            );
        }
        const hit = Array.isArray(existingRes.data) ? existingRes.data[0] : null;
        if (!hit?.id) {
            return NextResponse.json({ error: "Prodotto non trovato su WooCommerce per questo SKU." }, { status: 404 });
        }

        const fullRes = await axios.get(`${domain}/wp-json/wc/v3/products/${hit.id}`, {
            auth,
            timeout: wooAxiosTimeout,
            validateStatus: () => true,
        });
        if (fullRes.status >= 400) {
            return NextResponse.json(
                { error: "Errore lettura prodotto WooCommerce", details: fullRes.data },
                { status: 502 }
            );
        }

        const remote = Array.isArray(fullRes.data?.images) ? fullRes.data.images : [];
        const { images: deduped, removed: duplicateSrcRemoved } = dedupeWooImagesBySrc(remote);

        const erpUrlsRaw = (product.images || [])
            .map((x: any) => (typeof x === "string" ? x : x?.url))
            .filter((u: any) => typeof u === "string" && u.trim());

        const seenErp = new Set<string>();
        const uniqueErp: string[] = [];
        for (const u of erpUrlsRaw) {
            const n = normalizeImageUrlForDedupe(u, origin);
            if (!n || seenErp.has(n)) continue;
            seenErp.add(n);
            uniqueErp.push(u);
        }

        const { images: merged, added } = mergeErpUrlsIntoWooImages(deduped, uniqueErp, origin);
        let finalImages = merged.slice(0, maxGal);

        const axiosForBin = axios.create({
            timeout: 45000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
        });

        const hashResults: { img: any; hash: string | null }[] = [];
        const chunkSize = 4;
        for (let i = 0; i < finalImages.length; i += chunkSize) {
            const chunk = finalImages.slice(i, i + chunkSize);
            const part = await Promise.all(chunk.map((im) => hashWooImageEntry(im, axiosForBin)));
            hashResults.push(...part);
        }

        let duplicateByContentRemoved = 0;
        const afterHash: any[] = [];
        const seenH = new Set<string>();
        for (const { img, hash } of hashResults) {
            if (hash) {
                if (seenH.has(hash)) {
                    duplicateByContentRemoved++;
                    continue;
                }
                seenH.add(hash);
            }
            afterHash.push(img);
        }
        finalImages = afterHash.slice(0, maxGal);

        const putRes = await axios.put(
            `${domain}/wp-json/wc/v3/products/${hit.id}`,
            { images: finalImages },
            { auth, timeout: wooAxiosTimeout, validateStatus: () => true }
        );

        if (putRes.status >= 400) {
            return NextResponse.json(
                { error: "Errore aggiornamento immagini WooCommerce", details: putRes.data },
                { status: 502 }
            );
        }

        return NextResponse.json({
            success: true,
            wooId: putRes.data?.id ?? hit.id,
            duplicateSrcRemoved,
            duplicateByContentRemoved,
            imagesAdded: added,
            imageCount: Array.isArray(putRes.data?.images) ? putRes.data.images.length : finalImages.length,
        });
    } catch (err: any) {
        console.error("[woo sync-images]", err?.response?.data || err?.message);
        return NextResponse.json(
            { error: "Errore sync immagini WooCommerce", details: err?.response?.data || err?.message },
            { status: 500 }
        );
    }
}

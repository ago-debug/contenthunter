import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import {
    normalizeImageUrlForDedupe,
    resolveAbsoluteProductImageUrl,
    sha256Buffer,
} from "@/lib/ecommerce-image-sync";
import {
    createPrestaShopClient,
    deleteAllPrestaProductImages,
    deletePrestaProductImage,
    extractImageIdsFromPrestaProductRow,
    fetchPrestaProductImageBuffer,
    flattenPsResource,
    listPrestaProductImageIds,
    prestashopApiBase,
    prestashopPublicImageUrl,
    prestashopShopOrigin,
    uploadImagesToPrestaProduct,
} from "@/lib/prestashop-ws";

export const maxDuration = 300;

async function findProductIdByReference(client: ReturnType<typeof createPrestaShopClient>, reference: string) {
    const res = await client.get("/products", {
        params: {
            output_format: "JSON",
            display: "[id,reference]",
            "filter[reference]": `[${reference}]`,
        },
    });
    if (res.status >= 400) return null;
    const list = flattenPsResource<{ id?: string | number }>(res.data, "products");
    const id = list[0]?.id;
    return id != null ? String(id) : null;
}

async function buildErpImageHashes(product: any, publicOrigin: string): Promise<Set<string>> {
    const set = new Set<string>();
    const axiosForBin = axios.create({
        timeout: 45000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
    });
    const rawUrls = (product.images || [])
        .map((x: any) => (typeof x === "string" ? x : x?.url))
        .filter((u: any) => typeof u === "string" && u.trim());
    for (const raw of rawUrls) {
        const abs = resolveAbsoluteProductImageUrl(raw, publicOrigin);
        if (!abs) continue;
        try {
            const ir = await axiosForBin.get(abs, { responseType: "arraybuffer" });
            const ct = String(ir.headers["content-type"] || "");
            if (!ct.startsWith("image/")) continue;
            const buf = Buffer.from(ir.data);
            if (buf.length < 24) continue;
            set.add(sha256Buffer(buf));
        } catch {
            /* skip */
        }
    }
    return set;
}

async function refreshPrestaImageIdsAndHashes(
    base: string,
    key: string,
    client: ReturnType<typeof createPrestaShopClient>,
    prestashopId: string
): Promise<{ imageIds: string[]; idToHash: Map<string, string> }> {
    let imageIds = await listPrestaProductImageIds(client, prestashopId);
    if (imageIds.length === 0) {
        const pr = await client.get(`/products/${prestashopId}`, {
            params: { output_format: "JSON", display: "full" },
        });
        if (pr.status < 400) {
            const row = flattenPsResource<any>(pr.data, "products")[0];
            imageIds = extractImageIdsFromPrestaProductRow(row);
        }
    }
    const idToHash = new Map<string, string>();
    for (const iid of imageIds) {
        const buf = await fetchPrestaProductImageBuffer(base, key, prestashopId, iid);
        if (!buf) continue;
        idToHash.set(iid, sha256Buffer(buf));
    }
    return { imageIds, idToHash };
}

export async function POST(req: Request) {
    const ctx = await requireCompanyId(req);
    if (!ctx) {
        return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
    }
    const { companyId } = ctx;

    const body = await req.json();
    const {
        shopUrl,
        apiKey,
        product,
        mapping,
        publicOrigin,
        mode = "align",
    } = body as {
        shopUrl: string;
        apiKey: string;
        product: any;
        mapping?: { idShop?: number; maxImages?: number };
        publicOrigin?: string;
        mode?: "align" | "replace";
    };

    if (!shopUrl?.trim() || !apiKey?.trim() || !product?.sku) {
        return NextResponse.json({ error: "Dati mancanti (shopUrl, apiKey, product.sku)" }, { status: 400 });
    }

    const erpProductId = Number(product?.id);
    if (!Number.isFinite(erpProductId) || erpProductId <= 0) {
        return NextResponse.json({ error: "product.id richiesto (prodotto ERP)" }, { status: 400 });
    }

    const owned = await prisma.product.findFirst({
        where: { id: erpProductId, companyId },
        select: { id: true },
    });
    if (!owned) {
        return NextResponse.json({ error: "Prodotto non trovato per questa azienda" }, { status: 404 });
    }

    const idShopNum = mapping?.idShop != null ? Number(mapping.idShop) : NaN;
    const idShop = Number.isFinite(idShopNum) && idShopNum > 0 ? idShopNum : undefined;
    const maxImages = Math.min(30, Math.max(1, Number(mapping?.maxImages) || 12));

    const origin = (publicOrigin || "").trim() || new URL(req.url).origin;
    const base = prestashopApiBase(shopUrl);
    const key = apiKey.trim();
    const client = createPrestaShopClient(base, key, { idShop });
    const shopOrigin = prestashopShopOrigin(shopUrl);

    const sku = String(product.sku).trim();
    const extraPid = product?.extraFields?.prestashopProductId;
    let prestashopId: string | null =
        extraPid != null && String(extraPid).trim() ? String(extraPid).trim() : null;
    if (!prestashopId) {
        prestashopId = await findProductIdByReference(client, sku);
    }
    if (!prestashopId) {
        return NextResponse.json({ error: "Prodotto non trovato su PrestaShop (SKU / prestashopProductId)." }, { status: 404 });
    }

    try {
        const syncMode = mode === "replace" ? "replace" : "align";

        if (syncMode === "replace") {
            const del = await deleteAllPrestaProductImages(base, key, client, prestashopId, idShop);
            const urlsRaw = (product.images || [])
                .map((x: any) => (typeof x === "string" ? x : x?.url))
                .filter((u: any) => typeof u === "string" && u.trim());
            const seenNorm = new Set<string>();
            const uniqueUrls: string[] = [];
            for (const u of urlsRaw) {
                const n = normalizeImageUrlForDedupe(u, origin);
                if (!n || seenNorm.has(n)) continue;
                seenNorm.add(n);
                uniqueUrls.push(u);
            }
            const up = await uploadImagesToPrestaProduct(base, key, prestashopId, uniqueUrls, {
                maxImages: Math.min(maxImages, 30),
                idShop,
            });
            return NextResponse.json({
                success: true,
                mode: "replace",
                prestashopId,
                deletedOnPresta: del.deleted,
                imagesUploaded: up.uploaded,
                imagesFailed: up.failed,
                maxImages,
            });
        }

        /* --- align: dedup Presta → import verso ERP → carica ERP mancanti su Presta --- */

        let erpHashes = await buildErpImageHashes(product, origin);

        let { imageIds, idToHash } = await refreshPrestaImageIdsAndHashes(base, key, client, prestashopId);

        const hashToKeepId = new Map<string, string>();
        const idsToDelete: string[] = [];
        for (const iid of imageIds) {
            const h = idToHash.get(iid);
            if (!h) continue;
            if (hashToKeepId.has(h)) {
                idsToDelete.push(iid);
            } else {
                hashToKeepId.set(h, iid);
            }
        }

        let duplicatesRemoved = 0;
        for (const delId of idsToDelete) {
            const ok = await deletePrestaProductImage(base, key, prestashopId, delId, idShop);
            if (ok) duplicatesRemoved++;
        }

        const refreshed = await refreshPrestaImageIdsAndHashes(base, key, client, prestashopId);
        imageIds = refreshed.imageIds;
        idToHash = refreshed.idToHash;

        let importedFromPresta = 0;
        for (const iid of imageIds) {
            const h = idToHash.get(iid);
            if (!h) continue;
            if (erpHashes.has(h)) continue;
            const imageUrl = prestashopPublicImageUrl(shopOrigin, iid);
            if (!imageUrl) continue;
            const exists = await prisma.productImage.findFirst({
                where: { productId: erpProductId, imageUrl },
                select: { id: true },
            });
            if (exists) continue;
            await prisma.productImage.create({
                data: { productId: erpProductId, imageUrl },
            });
            importedFromPresta++;
            erpHashes.add(h);
        }

        let keptHashes = new Set(erpHashes);
        for (const id of imageIds) {
            const h = idToHash.get(id);
            if (h) keptHashes.add(h);
        }

        let currentCount = imageIds.length;
        let imagesUploaded = 0;
        let imagesFailed = 0;
        let skippedAlreadyPresent = 0;

        const axiosForBin = axios.create({
            timeout: 45000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
        });

        const erpUrlsRaw = (product.images || [])
            .map((x: any) => (typeof x === "string" ? x : x?.url))
            .filter((u: any) => typeof u === "string" && u.trim());

        const seenNorm = new Set<string>();
        const uniqueErp: string[] = [];
        for (const u of erpUrlsRaw) {
            const n = normalizeImageUrlForDedupe(u, origin);
            if (!n || seenNorm.has(n)) continue;
            seenNorm.add(n);
            uniqueErp.push(u);
        }

        for (const raw of uniqueErp) {
            if (currentCount >= maxImages) break;
            const abs = resolveAbsoluteProductImageUrl(raw, origin);
            if (!abs) continue;
            try {
                const ir = await axiosForBin.get(abs, { responseType: "arraybuffer" });
                const ct = String(ir.headers["content-type"] || "");
                if (!ct.startsWith("image/")) {
                    imagesFailed++;
                    continue;
                }
                const buf = Buffer.from(ir.data);
                if (buf.length < 24) {
                    imagesFailed++;
                    continue;
                }
                const h = sha256Buffer(buf);
                if (keptHashes.has(h)) {
                    skippedAlreadyPresent++;
                    continue;
                }
                const up = await uploadImagesToPrestaProduct(base, key, prestashopId, [abs], {
                    maxImages: 1,
                    idShop,
                });
                imagesUploaded += up.uploaded;
                imagesFailed += up.failed;
                if (up.uploaded > 0) {
                    keptHashes.add(h);
                    currentCount++;
                }
            } catch {
                imagesFailed++;
            }
        }

        return NextResponse.json({
            success: true,
            mode: "align",
            prestashopId,
            duplicatesRemoved,
            importedFromPresta,
            imagesUploaded,
            imagesFailed,
            skippedAlreadyPresent,
            maxImages,
        });
    } catch (err: any) {
        console.error("[prestashop sync-images]", err?.response?.data || err?.message);
        return NextResponse.json(
            { error: "Errore sync immagini PrestaShop", details: err?.response?.data || err?.message },
            { status: 500 }
        );
    }
}

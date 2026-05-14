import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

function signingSecret(): string {
    return (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").trim();
}

/** Base pubblica per URL assoluti (firma canali / Woo fetch da remoto). */
export function getPublicAppBaseUrl(): string {
    const explicit = process.env.PUBLIC_APP_BASE_URL?.trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    const v = process.env.VERCEL_URL?.trim();
    if (v) return (v.startsWith("http") ? v : `https://${v}`).replace(/\/+$/, "");
    return "";
}

export function verifyProductImageSignature(imageId: number, expStr: string | null, sig: string | null): boolean {
    const secret = signingSecret();
    if (!secret || !expStr || !sig) return false;
    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac("sha256", secret).update(`${imageId}:${exp}`).digest("base64url");
    try {
        const a = Buffer.from(sig, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

/** URL assoluta con query firmata (7 giorni) — integrazioni che scaricano via HTTP (Woo / hosting esterno). */
export function absoluteSignedProductImageUrl(imageId: number): string {
    const base = getPublicAppBaseUrl();
    const secret = signingSecret();
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    const sig = secret
        ? createHmac("sha256", secret).update(`${imageId}:${exp}`).digest("base64url")
        : "";
    const path = `/api/product-images/${imageId}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
    return base ? `${base}${path}` : path;
}

/** id da `/api/product-images/123` o URL assoluta che termina con quel path. */
export function parseProductImageApiId(url: string): number | null {
    const u = url.trim();
    const m = u.match(/(?:^https?:\/\/[^/]+)?\/api\/product-images\/(\d+)/i);
    if (!m) return null;
    const id = parseInt(m[1], 10);
    return Number.isFinite(id) ? id : null;
}

/** Path relativi + immagini API → URL assoluta per Woo/Presta che scaricano via HTTP. */
export function resolveChannelProductImageUrl(url: string): string {
    const u = (url || "").trim();
    if (!u) return u;
    const id = parseProductImageApiId(u);
    if (id != null) return absoluteSignedProductImageUrl(id);
    if (u.startsWith("/")) {
        const base = getPublicAppBaseUrl();
        return base ? `${base}${u}` : u;
    }
    return u;
}

/** URL mostrata al client (lista prodotti / Iris): blob DB vs path legacy. */
export function clientUrlForProductImage(img: {
    id: number | string;
    imageUrl: string;
    storedInDb?: boolean | null;
}): string {
    if (img.storedInDb === true) {
        const id = typeof img.id === "string" ? parseInt(img.id, 10) : img.id;
        return `/api/product-images/${id}`;
    }
    return img.imageUrl;
}

/** Buffer da DB per upload Presta / evitare HTTP loopback verso sé stessi. */
export async function loadStoredProductImageBuffer(imageId: number): Promise<{
    buffer: Buffer;
    mimeType: string;
} | null> {
    const row = await prisma.productImage.findUnique({
        where: { id: imageId },
        select: { imageData: true, mimeType: true },
    });
    if (!row?.imageData?.length) return null;
    const mime =
        row.mimeType?.split(";")[0]?.trim().toLowerCase() ||
        "image/jpeg";
    return { buffer: Buffer.from(row.imageData), mimeType: mime };
}

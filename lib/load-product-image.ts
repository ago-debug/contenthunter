import path from "path";
import { readFile } from "fs/promises";
import { loadStoredProductImageBuffer, parseProductImageApiId } from "@/lib/product-image-serving";

/** Carica i byte dell'immagine prodotto (URL assoluto o path sotto /public). */
export async function loadProductImageBytes(imageUrl: string): Promise<{
    buffer: Buffer;
    filename: string;
    mime: string;
}> {
    const trimmed = imageUrl.trim();

    const apiId = parseProductImageApiId(trimmed);
    if (apiId != null) {
        const loaded = await loadStoredProductImageBuffer(apiId);
        if (!loaded) {
            throw new Error(`Immagine catalogo (id ${apiId}) non disponibile nel database.`);
        }
        const mime = loaded.mimeType;
        const ext =
            mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("jpeg") ? ".jpg" : ".png";
        return { buffer: loaded.buffer, filename: `product-source${ext}`, mime };
    }

    if (/^https?:\/\//i.test(trimmed)) {
        const res = await fetch(trimmed);
        if (!res.ok) {
            throw new Error(`Impossibile scaricare l'immagine prodotto (${res.status}).`);
        }
        const arr = await res.arrayBuffer();
        const buffer = Buffer.from(arr);
        const urlPath = new URL(trimmed).pathname;
        const ext = path.extname(urlPath).toLowerCase();
        const safeExt =
            ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" ? ext : ".png";
        const mime =
            res.headers.get("content-type")?.split(";")[0]?.trim() ||
            (safeExt === ".jpg" || safeExt === ".jpeg"
                ? "image/jpeg"
                : safeExt === ".webp"
                  ? "image/webp"
                  : "image/png");
        return { buffer, filename: `product-source${safeExt}`, mime };
    }

    const rel = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    const abs = path.join(process.cwd(), "public", rel);
    const ext = path.extname(abs).toLowerCase();
    const safeExt =
        ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp" ? ext : ".png";
    const buffer = await readFile(abs);
    const mime =
        safeExt === ".jpg" || safeExt === ".jpeg"
            ? "image/jpeg"
            : safeExt === ".webp"
              ? "image/webp"
              : "image/png";
    return { buffer, filename: `product-source${safeExt}`, mime };
}

import crypto from "crypto";

/** Normalizza URL per confronto (host+path, senza query/hash). */
export function normalizeImageUrlForDedupe(raw: string, publicOrigin?: string): string {
    const t = (raw || "").trim();
    if (!t) return "";
    try {
        let u: URL;
        if (/^https?:\/\//i.test(t)) {
            u = new URL(t);
        } else if (t.startsWith("//")) {
            u = new URL(`https:${t}`);
        } else if (publicOrigin && (t.startsWith("/") || !t.includes("://"))) {
            const base = publicOrigin.replace(/\/$/, "");
            u = new URL(t.startsWith("/") ? t : `/${t}`, `${base}/`);
        } else {
            return t.replace(/\?.*$/, "").replace(/#.*$/, "").toLowerCase();
        }
        u.hash = "";
        u.search = "";
        let href = u.href.replace(/\/$/, "");
        if (href.startsWith("https://")) href = href.slice(8);
        else if (href.startsWith("http://")) href = href.slice(7);
        return href.toLowerCase();
    } catch {
        return t.replace(/\?.*$/, "").replace(/#.*$/, "").toLowerCase();
    }
}

export function resolveAbsoluteProductImageUrl(raw: string, publicOrigin: string): string {
    const t = (raw || "").trim();
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith("//")) return `https:${t}`;
    const base = publicOrigin.replace(/\/$/, "");
    if (t.startsWith("/")) return `${base}${t}`;
    return `${base}/${t}`;
}

export function sha256Buffer(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Rimuove righe WooCommerce con stesso src normalizzato (mantiene ordine e prima occorrenza). */
export function dedupeWooImagesBySrc(images: any[]): { images: any[]; removed: number } {
    const seen = new Set<string>();
    const out: any[] = [];
    let removed = 0;
    for (const img of images || []) {
        const src = img?.src;
        if (!src || typeof src !== "string") continue;
        const n = normalizeImageUrlForDedupe(src);
        if (!n) continue;
        if (seen.has(n)) {
            removed++;
            continue;
        }
        seen.add(n);
        out.push(img);
    }
    return { images: out, removed };
}

/** Aggiunge in coda immagini ERP assenti (per URL normalizzato). */
export function mergeErpUrlsIntoWooImages(
    dedupedRemote: any[],
    erpImageUrls: string[],
    publicOrigin: string
): { images: any[]; added: number } {
    const seen = new Set<string>();
    for (const img of dedupedRemote) {
        const n = normalizeImageUrlForDedupe(String(img?.src || ""), publicOrigin);
        if (n) seen.add(n);
    }
    let added = 0;
    const out = [...dedupedRemote];
    for (const raw of erpImageUrls) {
        const abs = resolveAbsoluteProductImageUrl(raw, publicOrigin);
        if (!abs) continue;
        const n = normalizeImageUrlForDedupe(abs, publicOrigin);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push({ src: abs });
        added++;
    }
    return { images: out, added };
}

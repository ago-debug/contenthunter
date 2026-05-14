import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { prisma } from "@/lib/prisma";
import { parseProductImageApiId, resolveChannelProductImageUrl } from "@/lib/product-image-serving";

/** Base URL webservice: …/api (senza slash finale). */
export function prestashopApiBase(shopUrl: string): string {
    const t = shopUrl.trim().replace(/\/+$/, "");
    if (!t) throw new Error("URL negozio vuoto");
    return t.endsWith("/api") ? t : `${t}/api`;
}

/** Origine pubblica negozio (https://shop.tld) per URL immagini. */
export function prestashopShopOrigin(shopUrl: string): string {
    const base = prestashopApiBase(shopUrl);
    return base.replace(/\/api$/i, "");
}

export function createPrestaShopClient(
    apiBase: string,
    apiKey: string,
    options?: { idShop?: number | null }
): AxiosInstance {
    const client = axios.create({
        baseURL: apiBase,
        auth: { username: apiKey.trim(), password: "" },
        timeout: 120000,
        validateStatus: (s) => s >= 200 && s < 600,
    });
    const idShop = options?.idShop;
    if (idShop != null && Number.isFinite(idShop) && idShop > 0) {
        client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            config.params = { ...config.params, id_shop: idShop };
            return config;
        });
    }
    return client;
}

export function asArray<T>(x: T | T[] | undefined | null): T[] {
    if (x == null) return [];
    return Array.isArray(x) ? x : [x];
}

/** Estrae testo da campi multilingua del JSON webservice PrestaShop. */
export function extractLocalizedField(raw: any, preferLangId: number): string {
    if (raw == null) return "";
    if (typeof raw === "string" || typeof raw === "number") return String(raw).trim();

    if (Array.isArray(raw)) {
        const sid = String(preferLangId);
        const hit = raw.find((item) => {
            const id = item?.id ?? item?.["@attributes"]?.id ?? item?.attrs?.id;
            return id !== undefined && String(id) === sid;
        });
        const pick = hit ?? raw[0];
        if (pick == null) return "";
        if (typeof pick === "string") return pick.trim();
        const v = pick.value ?? pick["#text"] ?? pick;
        return String(v ?? "").trim();
    }

    if (typeof raw === "object") {
        const lang = (raw as any).language;
        if (lang !== undefined) return extractLocalizedField(asArray(lang), preferLangId);
    }

    return "";
}

export function slugifyLinkRewrite(title: string, fallback: string): string {
    const base = (title || fallback || "product")
        .toLowerCase()
        .normalize("NFD")
        // Combining marks (NFD); evita \p{M} che con target TS es5 fallisce il typecheck
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
    return base || "product";
}

function cdata(s: string): string {
    return `<![CDATA[${String(s).replace(/\]\]>/g, "")}]]>`;
}

/** EAN-13 con checksum corretto (PrestaShop rifiuta codici invalidi). */
export function isValidEan13(raw: string): boolean {
    const d = String(raw).replace(/\D/g, "");
    if (d.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(d[i]!, 10) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(d[12]!, 10);
}

/** Estrae messaggi dall’XML `<errors>` del webservice PrestaShop. */
export function parsePrestaShopErrorMessages(xml: string): string[] {
    if (!xml || typeof xml !== "string") return [];
    const out: string[] = [];
    const re = /<error>([\s\S]*?)<\/error>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const block = m[1] ?? "";
        const code =
            block.match(/<code>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/code>/i)?.[1]?.trim() ??
            block.match(/<code>([^<]*)<\/code>/i)?.[1]?.trim();
        const message =
            block.match(/<message>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/message>/i)?.[1]?.trim() ??
            block.match(/<message>([^<]*)<\/message>/i)?.[1]?.trim();
        const line = [code && `[${code}]`, message].filter(Boolean).join(" ").trim();
        if (line) out.push(line);
    }
    return out;
}

/** Percorso cartella immagine PrestaShop (str_split id). */
export function prestashopImageFolderPath(imageId: string | number): string {
    const id = String(imageId).replace(/\D/g, "");
    if (!id) return "";
    return id.split("").join("/") + "/";
}

/** URL pubblico tipico immagine prodotto (img/p/…/{id}.jpg). */
export function prestashopPublicImageUrl(shopOrigin: string, imageId: string | number): string {
    const origin = shopOrigin.replace(/\/+$/, "");
    const id = String(imageId).replace(/\D/g, "");
    if (!id) return "";
    const folder = prestashopImageFolderPath(id);
    return `${origin}/img/p/${folder}${id}.jpg`;
}

/** Unità in cui è espresso il peso in anagrafica ERP (convertito verso l’unità negozio Presta, v. PS_WEIGHT_UNIT). */
export type PrestaErpWeightInputUnit = "kg" | "g" | "lb";

export type PrestaProductMapping = {
    defaultCategoryId: number;
    languageId: number;
    idTaxRulesGroup?: number;
    /** Peso in scheda: kg (default), grammi o libbre → normalizzato verso PS_WEIGHT_UNIT del negozio. */
    erpWeightInputUnit?: PrestaErpWeightInputUnit;
    stockQuantityERPKey?: "stockLocal" | "stockSupplier";
    /** Multistore */
    idShop?: number | null;
    /** Cerca/crea manufacturer da `product.brand` se assente su PS */
    syncManufacturer?: boolean;
    /** Cerca/crea categoria default da `product.category` (o nome da categoryId DB) */
    syncCategoryFromProduct?: boolean;
    /** id_parent PrestaShop per categorie nuove (tipicamente 2 = Home) */
    categoryParentId?: number;
    /** Carica immagini da product.images dopo salvataggio */
    uploadImages?: boolean;
    /** Max immagini per push */
    maxImages?: number;
    /**
     * Se true (default): il prezzo ERP è listino IVA inclusa → inviato a Presta come imponibile
     * usando `product.vatCode` / `vatCodeId` + tabella VatCode.
     * Se false: il valore ERP è già senza IVA (come richiede il campo `price` di Presta).
     */
    erpPriceIncludesVat?: boolean;
    /** Chiave = nome normalizzato (trim + lower); evita scan ripetuti nel push massivo */
    categoryResolveCache?: Record<string, number>;
    manufacturerResolveCache?: Record<string, number>;
};

export function normalizePrestaResolveCacheKey(label: string): string {
    return String(label ?? "")
        .trim()
        .toLowerCase();
}

export type PrestaLangPayload = {
    id: number;
    title: string;
    description: string;
    descriptionShort: string;
    slug: string;
};

export function buildProductXml(params: {
    mapping: PrestaProductMapping;
    sku: string;
    price: string;
    productId?: string | null;
    ean?: string | null;
    idManufacturer?: number;
    langs: PrestaLangPayload[];
    /** Valori numerici come stringa (punto decimale); omessi se undefined. */
    width?: string;
    height?: string;
    depth?: string;
    weight?: string;
    /** Campo Presta `unity` (etichetta unità, es. kg / g / lb) — usato in BO per prezzo al peso / resa. */
    unity?: string;
}): string {
    const { mapping, sku, price, productId, ean, idManufacturer, langs, width, height, depth, weight, unity } =
        params;
    const cat = mapping.defaultCategoryId;
    const tax = mapping.idTaxRulesGroup ?? 1;
    const idXml = productId ? `<id>${cdata(productId)}</id>` : "";
    const mId = idManufacturer != null && idManufacturer > 0 ? idManufacturer : 0;

    const eanStr = ean && String(ean).trim() ? String(ean).trim().slice(0, 13) : "";
    const eanXml =
        eanStr && isValidEan13(eanStr) ? `<ean13>${cdata(eanStr.replace(/\D/g, "").slice(0, 13))}</ean13>` : "";

    const nameXml = langs
        .map((l) => `<language id="${l.id}">${cdata(l.title || sku)}</language>`)
        .join("");
    const rewriteXml = langs.map((l) => `<language id="${l.id}">${cdata(l.slug)}</language>`).join("");
    const descXml = langs.map((l) => `<language id="${l.id}">${cdata(l.description || "")}</language>`).join("");
    const shortXml = langs
        .map((l) => `<language id="${l.id}">${cdata(l.descriptionShort || "")}</language>`)
        .join("");

    const idShop = mapping.idShop != null && Number(mapping.idShop) > 0 ? Number(mapping.idShop) : 0;
    const idShopDefaultXml = idShop > 0 ? `<id_shop_default>${cdata(String(idShop))}</id_shop_default>` : "";

    // meta_title / meta_description / meta_keywords: omessi (validazione Presta rigida; descrizione ERP spesso HTML).
    // Si possono compilare in back office Presta, con un modulo SEO o con un job dedicato in seguito.

    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
<product>
${idXml}
<reference>${cdata(sku)}</reference>
${eanXml}
<id_manufacturer>${cdata(String(mId))}</id_manufacturer>
<id_supplier>${cdata("0")}</id_supplier>
${width != null && width !== "" ? `<width>${cdata(width)}</width>` : ""}
${height != null && height !== "" ? `<height>${cdata(height)}</height>` : ""}
${depth != null && depth !== "" ? `<depth>${cdata(depth)}</depth>` : ""}
${weight != null && weight !== "" ? `<weight>${cdata(weight)}</weight>` : ""}
${unity != null && unity !== "" ? `<unity>${cdata(unity)}</unity>` : ""}
<price>${cdata(price)}</price>
<unit_price>${cdata(price)}</unit_price>
<active>1</active>
<id_tax_rules_group>${cdata(String(tax))}</id_tax_rules_group>
<id_category_default>${cdata(String(cat))}</id_category_default>
<type>${cdata("1")}</type>
<product_type>${cdata("standard")}</product_type>
<state>${cdata("1")}</state>
<visibility>${cdata("both")}</visibility>
<available_for_order>1</available_for_order>
<show_price>1</show_price>
${idShopDefaultXml}
<name>${nameXml}</name>
<link_rewrite>${rewriteXml}</link_rewrite>
<description>${descXml}</description>
<description_short>${shortXml}</description_short>
<associations>
<categories>
<category><id>${cdata(String(cat))}</id></category>
</categories>
</associations>
</product>
</prestashop>`;
}

export function parseFirstTagCdata(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([^\\]]*)\\]\\]>\\s*</${tag}>`, "i");
    const m = xml.match(re);
    return m?.[1]?.trim() ?? null;
}

/** ID prodotto dalla risposta XML di POST/PUT /products */
export function parseProductIdFromResponseXml(xml: string): string | null {
    const m = xml.match(/<product>[\s\S]*?<id>\s*<!\[CDATA\[(\d+)\]\]>\s*<\/id>/i);
    return m?.[1] ?? parseFirstTagCdata(xml, "id");
}

export function parseManufacturerIdFromResponseXml(xml: string): string | null {
    const m = xml.match(/<manufacturer>[\s\S]*?<id>\s*<!\[CDATA\[(\d+)\]\]>\s*<\/id>/i);
    return m?.[1] ?? parseFirstTagCdata(xml, "id");
}

export function parseCategoryIdFromResponseXml(xml: string): string | null {
    const m = xml.match(/<category>[\s\S]*?<id>\s*<!\[CDATA\[(\d+)\]\]>\s*<\/id>/i);
    return m?.[1] ?? parseFirstTagCdata(xml, "id");
}

export function buildCategoryCreateXml(args: {
    name: string;
    languageId: number;
    idParent: number;
}): string {
    const { name, languageId, idParent } = args;
    const n = name.trim();
    const slug = slugifyLinkRewrite(n, n) || "category";
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
<category>
<id_parent>${cdata(String(idParent))}</id_parent>
<active>1</active>
<name><language id="${languageId}">${cdata(n)}</language></name>
<link_rewrite><language id="${languageId}">${cdata(slug)}</language></link_rewrite>
</category>
</prestashop>`;
}

export function buildManufacturerCreateXml(name: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
<manufacturer>
<name>${cdata(name.trim())}</name>
</manufacturer>
</prestashop>`;
}

function nameMatchPsLocalized(rawName: unknown, want: string, languageId: number): boolean {
    const n = extractLocalizedField(rawName, languageId).trim().toLowerCase();
    const w = want.trim().toLowerCase();
    if (n === w) return true;
    return String(rawName ?? "")
        .trim()
        .toLowerCase() === w;
}

export async function resolveOrCreateManufacturerId(
    client: AxiosInstance,
    brandName: string,
    languageId: number = 1,
    cache?: Record<string, number>
): Promise<number | undefined> {
    const name = brandName.trim();
    if (!name) return undefined;
    const ck = normalizePrestaResolveCacheKey(name);
    if (cache != null) {
        const hit = cache[ck];
        if (hit != null && hit > 0) return hit;
    }
    const res = await client.get("/manufacturers", {
        params: {
            output_format: "JSON",
            display: "[id,name]",
            "filter[name]": `[${name}]`,
        },
    });
    if (res.status < 400) {
        const list = flattenPsResource<{ id?: string | number; name?: unknown }>(res.data, "manufacturers");
        const exact = list.find((m) => nameMatchPsLocalized(m.name, name, languageId));
        if (exact?.id != null) {
            const num = Number(exact.id);
            if (num > 0 && cache != null) cache[ck] = num;
            return num;
        }
    }
    const scan = await client.get("/manufacturers", {
        params: {
            output_format: "JSON",
            display: "[id,name]",
            limit: "0,500",
        },
    });
    if (scan.status < 400) {
        const list = flattenPsResource<{ id?: string | number; name?: unknown }>(scan.data, "manufacturers");
        const exact = list.find((m) => nameMatchPsLocalized(m.name, name, languageId));
        if (exact?.id != null) {
            const num = Number(exact.id);
            if (num > 0 && cache != null) cache[ck] = num;
            return num;
        }
    }
    const xml = buildManufacturerCreateXml(name);
    const post = await client.post("/manufacturers", xml, {
        headers: { "Content-Type": "application/xml" },
    });
    if (post.status >= 400) return undefined;
    const raw = typeof post.data === "string" ? post.data : "";
    const id = parseManufacturerIdFromResponseXml(raw);
    const num = id != null ? Number(id) : undefined;
    if (num != null && num > 0 && cache != null) cache[ck] = num;
    return num;
}

/**
 * Trova categoria PS per nome (lingua `languageId`) o la crea sotto `idParent` (default 2 = Home).
 */
export async function resolveOrCreateCategoryId(
    client: AxiosInstance,
    categoryName: string,
    opts: { languageId: number; idParent?: number },
    cache?: Record<string, number>
): Promise<number | undefined> {
    const name = categoryName.trim();
    if (!name) return undefined;
    const langId = opts.languageId;
    const parent = opts.idParent != null && Number(opts.idParent) > 0 ? Number(opts.idParent) : 2;
    const ck = normalizePrestaResolveCacheKey(name);
    if (cache != null) {
        const hit = cache[ck];
        if (hit != null && hit > 0) return hit;
    }

    const filtered = await client.get("/categories", {
        params: {
            output_format: "JSON",
            display: "[id,id_parent,name]",
            "filter[name]": `[${name}]`,
            limit: "0,20",
        },
    });
    if (filtered.status < 400) {
        const list = flattenPsResource<{ id?: string | number; name?: unknown; id_parent?: string | number }>(
            filtered.data,
            "categories"
        );
        const exact = list.find((c) => nameMatchPsLocalized(c.name, name, langId));
        if (exact?.id != null) {
            const num = Number(exact.id);
            if (num > 0 && cache != null) cache[ck] = num;
            return num;
        }
    }

    const underParent = await client.get("/categories", {
        params: {
            output_format: "JSON",
            display: "[id,id_parent,name]",
            "filter[id_parent]": `[${parent}]`,
            limit: "0,500",
        },
    });
    if (underParent.status < 400) {
        const list = flattenPsResource<{ id?: string | number; name?: unknown }>(underParent.data, "categories");
        const exact = list.find((c) => nameMatchPsLocalized(c.name, name, langId));
        if (exact?.id != null) {
            const num = Number(exact.id);
            if (num > 0 && cache != null) cache[ck] = num;
            return num;
        }
    }

    const scan = await client.get("/categories", {
        params: {
            output_format: "JSON",
            display: "[id,id_parent,name]",
            limit: "0,1000",
        },
    });
    if (scan.status < 400) {
        const list = flattenPsResource<{ id?: string | number; name?: unknown }>(scan.data, "categories");
        const exact = list.find((c) => nameMatchPsLocalized(c.name, name, langId));
        if (exact?.id != null) {
            const num = Number(exact.id);
            if (num > 0 && cache != null) cache[ck] = num;
            return num;
        }
    }

    const xml = buildCategoryCreateXml({ name, languageId: langId, idParent: parent });
    const post = await client.post("/categories", xml, {
        headers: { "Content-Type": "application/xml" },
    });
    if (post.status >= 400) return undefined;
    const raw = typeof post.data === "string" ? post.data : "";
    const id = parseCategoryIdFromResponseXml(raw);
    const num = id != null ? Number(id) : undefined;
    if (num != null && num > 0 && cache != null) cache[ck] = num;
    return num;
}

/** Scarica URL e invia a POST /images/products/{id} (multipart, campo `image`). */
export async function uploadImagesToPrestaProduct(
    apiBase: string,
    apiKey: string,
    productId: string,
    imageUrls: Array<string | { url?: string }>,
    options?: { maxImages?: number; idShop?: number | null }
): Promise<{ uploaded: number; failed: number }> {
    const max = Math.max(1, Math.min(options?.maxImages ?? 12, 30));
    const key = apiKey.trim();
    const auth = Buffer.from(`${key}:`).toString("base64");
    let uploaded = 0;
    let failed = 0;

    const list = imageUrls
        .map((x) => (typeof x === "string" ? x : x?.url))
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0);

    for (let i = 0; i < Math.min(list.length, max); i++) {
        const url = list[i];
        try {
            let buf: Buffer;
            let ct: string;
            const internalId = parseProductImageApiId(url);
            if (internalId != null) {
                const row = await prisma.productImage.findUnique({
                    where: { id: internalId },
                    select: { imageData: true, mimeType: true },
                });
                if (!row?.imageData?.length) {
                    failed++;
                    continue;
                }
                buf = Buffer.from(row.imageData);
                ct = String(row.mimeType || "image/jpeg").split(";")[0].trim();
            } else {
                const fetchUrl = resolveChannelProductImageUrl(url);
                const imgRes = await axios.get(fetchUrl, {
                    responseType: "arraybuffer",
                    timeout: 45000,
                    maxRedirects: 5,
                    validateStatus: (s) => s >= 200 && s < 400,
                });
                ct = String(imgRes.headers["content-type"] || "image/jpeg").split(";")[0].trim();
                buf = Buffer.from(imgRes.data);
            }
            if (!ct.startsWith("image/")) {
                failed++;
                continue;
            }
            const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
            const form = new FormData();
            const u8 = new Uint8Array(buf);
            form.append("image", new Blob([u8], { type: ct }), `product-${i}.${ext}`);

            let postUrl = `${apiBase.replace(/\/$/, "")}/images/products/${productId}`;
            const sp = new URLSearchParams();
            sp.set("output_format", "JSON");
            if (options?.idShop != null && options.idShop > 0) sp.set("id_shop", String(options.idShop));
            postUrl += `?${sp.toString()}`;

            const r = await fetch(postUrl, {
                method: "POST",
                headers: { Authorization: `Basic ${auth}` },
                body: form,
            });
            if (r.ok) uploaded++;
            else failed++;
        } catch {
            failed++;
        }
    }

    return { uploaded, failed };
}

/** ID immagini prodotto da GET `/images/products/{productId}` (JSON). */
export async function listPrestaProductImageIds(client: AxiosInstance, productId: string): Promise<string[]> {
    const res = await client.get(`/images/products/${productId}`, {
        params: { output_format: "JSON" },
    });
    if (res.status >= 400) return [];
    const data = res.data;
    const node = data?.images?.image ?? data?.image;
    const arr = asArray(node);
    const ids: string[] = [];
    for (const x of arr) {
        const id = x?.id ?? x?.["@attributes"]?.id;
        if (id != null && String(id).length > 0) ids.push(String(id));
    }
    return ids;
}

/** Fallback: associations dal GET prodotto full. */
export function extractImageIdsFromPrestaProductRow(row: any): string[] {
    if (!row || typeof row !== "object") return [];
    const assoc = row.associations;
    if (!assoc || typeof assoc !== "object") return [];
    const images = assoc.images;
    if (!images) return [];
    const node = images.image ?? images;
    const arr = asArray(node);
    const ids: string[] = [];
    for (const item of arr) {
        const id = item?.id ?? item?.["@attributes"]?.id;
        if (id != null && String(id).length > 0) ids.push(String(id));
    }
    return ids;
}

export async function fetchPrestaProductImageBuffer(
    apiBase: string,
    apiKey: string,
    productId: string,
    imageId: string
): Promise<Buffer | null> {
    const url = `${apiBase.replace(/\/$/, "")}/images/products/${productId}/${imageId}`;
    try {
        const r = await axios.get(url, {
            auth: { username: apiKey.trim(), password: "" },
            responseType: "arraybuffer",
            timeout: 90000,
            validateStatus: (s) => s >= 200 && s < 400,
        });
        if (r.status >= 400 || !r.data) return null;
        const buf = Buffer.from(r.data);
        if (buf.length < 32) return null;
        return buf;
    } catch {
        return null;
    }
}

export async function deletePrestaProductImage(
    apiBase: string,
    apiKey: string,
    productId: string,
    imageId: string,
    idShop?: number | null
): Promise<boolean> {
    let delUrl = `${apiBase.replace(/\/$/, "")}/images/products/${productId}/${imageId}`;
    const sp = new URLSearchParams();
    sp.set("output_format", "JSON");
    if (idShop != null && Number.isFinite(idShop) && idShop > 0) sp.set("id_shop", String(idShop));
    delUrl += `?${sp.toString()}`;
    const auth = Buffer.from(`${apiKey.trim()}:`).toString("base64");
    try {
        const r = await fetch(delUrl, {
            method: "DELETE",
            headers: { Authorization: `Basic ${auth}` },
        });
        return r.ok;
    } catch {
        return false;
    }
}

/**
 * Elimina tutte le immagini associate al prodotto su Presta (più passate finché l’elenco è vuoto).
 */
export async function deleteAllPrestaProductImages(
    apiBase: string,
    apiKey: string,
    client: AxiosInstance,
    productId: string,
    idShop?: number | null
): Promise<{ deleted: number; rounds: number }> {
    let deleted = 0;
    let rounds = 0;
    const maxRounds = 40;
    for (; rounds < maxRounds; rounds++) {
        const ids = await listPrestaProductImageIds(client, productId);
        if (ids.length === 0) break;
        for (const iid of ids) {
            if (await deletePrestaProductImage(apiBase, apiKey, productId, iid, idShop)) {
                deleted++;
            }
        }
    }
    return { deleted, rounds };
}

export function buildStockAvailablePatchXml(stockAvailableId: string, quantity: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
<stock_available>
<id>${cdata(stockAvailableId)}</id>
<quantity>${cdata(String(quantity))}</quantity>
</stock_available>
</prestashop>`;
}

export async function patchStockForSimpleProduct(
    client: AxiosInstance,
    productId: string,
    quantity: number
): Promise<void> {
    const res = await client.get("/stock_availables", {
        params: {
            output_format: "JSON",
            display: "full",
            "filter[id_product]": `[${productId}]`,
            "filter[id_product_attribute]": `[0]`,
        },
    });
    if (res.status >= 400) return;
    const rows = flattenPsResource<any>(res.data, "stock_availables");
    const row = rows.find((r) => String(r?.id_product_attribute ?? "0") === "0") ?? rows[0];
    const sid = row?.id;
    if (sid == null) return;
    const xml = buildStockAvailablePatchXml(String(sid), quantity);
    await client.patch(`/stock_availables/${sid}`, xml, {
        headers: { "Content-Type": "application/xml" },
    });
}

/**
 * Aliquota % (es. 22) dalla prima regola del gruppo tasse Presta, per allineare lo scorporo
 * del listino IVA inclusa ERP al calcolo IVATO mostrato in back office sul prodotto.
 */
export async function fetchVatRatePercentForTaxRulesGroup(
    client: AxiosInstance,
    groupId: number
): Promise<number | null> {
    if (!Number.isFinite(groupId) || groupId <= 0) return null;
    try {
        const res = await client.get("/tax_rules", {
            params: {
                output_format: "JSON",
                display: "[id,id_tax_rules_group,id_tax]",
                "filter[id_tax_rules_group]": `[${groupId}]`,
                limit: "0,80",
            },
        });
        if (res.status >= 400) return null;
        const rules = flattenPsResource<{ id_tax?: string | number }>(res.data, "tax_rules");
        const seenTax = new Set<string>();
        for (const r of rules) {
            const tid = r?.id_tax;
            if (tid == null) continue;
            const ts = String(tid).trim();
            if (!ts || seenTax.has(ts)) continue;
            seenTax.add(ts);
            const tres = await client.get(`/taxes/${ts}`, {
                params: { output_format: "JSON", display: "[id,rate]" },
                validateStatus: (s) => s >= 200 && s < 600,
            });
            if (tres.status >= 400) continue;
            const trow = flattenPsResource<{ rate?: string | number }>(tres.data, "taxes")[0];
            const rateRaw = trow?.rate;
            if (rateRaw == null) continue;
            const n = parseFloat(String(rateRaw).replace(",", "."));
            if (Number.isFinite(n) && n >= 0) return n;
        }
        return null;
    } catch {
        return null;
    }
}

export function flattenPsResource<T>(body: any, resourceKey: string): T[] {
    if (!body || typeof body !== "object") return [];
    const node = body[resourceKey];
    return asArray(node) as T[];
}

const PS_WEIGHT_UNIT_CACHE_MS = 10 * 60 * 1000;
const psWeightUnitCache = new Map<string, { value: string | null; at: number }>();

/** Valore configurazione `PS_WEIGHT_UNIT` del negozio (es. kg, g, lb). */
export async function fetchPrestaShopWeightUnit(client: AxiosInstance): Promise<string | null> {
    try {
        const res = await client.get("/configurations", {
            params: {
                output_format: "JSON",
                display: "[name,value]",
                "filter[name]": "[PS_WEIGHT_UNIT]",
                limit: "0,5",
            },
            validateStatus: (s) => s >= 200 && s < 600,
        });
        if (res.status >= 400) return null;
        const rows = flattenPsResource<{ name?: string; value?: string | number }>(res.data, "configurations");
        const row =
            rows.find((r) => String(r?.name ?? "").toUpperCase() === "PS_WEIGHT_UNIT") ?? rows[0];
        const raw = row?.value != null ? String(row.value).trim().toLowerCase() : "";
        if (!raw) return null;
        if (raw === "lbs" || raw === "lb" || raw === "libbre") return "lb";
        if (raw === "g" || raw === "gr" || raw === "grs" || raw === "grammi" || raw === "grams") return "g";
        if (raw === "kg" || raw === "kgs" || raw === "kilogram" || raw === "kilograms") return "kg";
        return raw;
    } catch {
        return null;
    }
}

export async function fetchPrestaShopWeightUnitCached(
    client: AxiosInstance,
    cacheKey: string
): Promise<string | null> {
    const now = Date.now();
    const hit = psWeightUnitCache.get(cacheKey);
    if (hit && now - hit.at < PS_WEIGHT_UNIT_CACHE_MS) return hit.value;
    const v = await fetchPrestaShopWeightUnit(client);
    psWeightUnitCache.set(cacheKey, { value: v, at: now });
    return v;
}

export function parsePrestaPhysicalFloat(raw: unknown): number | null {
    if (raw == null) return null;
    const s = String(raw)
        .trim()
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function erpWeightToKg(value: number, erpUnit: PrestaErpWeightInputUnit): number {
    if (erpUnit === "kg") return value;
    if (erpUnit === "g") return value / 1000;
    return value * 0.45359237;
}

function kgToPrestaShopNumeric(kg: number, shopUnit: string | null): number {
    const u = (shopUnit || "kg").toLowerCase();
    if (u === "g" || u === "gr" || u === "grams") return kg * 1000;
    if (u === "lb" || u === "lbs" || u === "libbre") return kg / 0.45359237;
    if (u === "oz" || u === "ozs") return kg / 0.028349523125;
    return kg;
}

/**
 * Converte il peso anagrafica (valore in {@link erpUnit}) nel numero da inviare nel campo webservice `weight`
 * (nell’unità del negozio Presta, v. PS_WEIGHT_UNIT).
 */
export function convertErpWeightToPrestaWeightField(
    valueInErpUnit: number,
    erpUnit: PrestaErpWeightInputUnit,
    shopWeightUnit: string | null
): number {
    const kg = erpWeightToKg(valueInErpUnit, erpUnit);
    return kgToPrestaShopNumeric(kg, shopWeightUnit);
}

/** Etichetta breve per `<unity>` allineata all’unità negozio (solo resa testuale in Presta). */
export function prestashopUnityLabelForWeightUnit(shopWeightUnit: string | null): string {
    const u = (shopWeightUnit || "kg").toLowerCase();
    if (u === "g" || u === "gr" || u === "grams") return "g";
    if (u === "lb" || u === "lbs" || u === "libbre") return "lb";
    if (u === "oz" || u === "ozs") return "oz";
    return "kg";
}

/** Normalizza codice lingua ERP (it, en, de…) da iso_code PrestaShop. */
export function prestashopIsoToLangCode(isoCode: unknown): string | null {
    const s = String(isoCode ?? "")
        .trim()
        .toLowerCase()
        .split("-")[0];
    const base = s.replace(/[^a-z]/g, "");
    return base.length >= 2 ? base.slice(0, 8) : null;
}

import axios from "axios";

export function normalizeWooResolveCacheKey(label: string): string {
    return String(label ?? "")
        .trim()
        .toLowerCase();
}

function wooBase(domain: string): string {
    return domain.trim().replace(/\/+$/, "");
}

const wooAxiosTimeout = 90000;

/**
 * Trova categoria Woo per nome (search REST) o la crea sotto `parent` (0 = radice).
 */
export async function resolveOrCreateWooCategoryId(
    domain: string,
    key: string,
    secret: string,
    categoryName: string,
    opts: { parent?: number },
    cache?: Record<string, number>
): Promise<number | undefined> {
    const name = categoryName.trim();
    if (!name) return undefined;
    const ck = normalizeWooResolveCacheKey(name);
    if (cache != null) {
        const hit = cache[ck];
        if (hit != null && hit > 0) return hit;
    }

    const base = wooBase(domain);
    const auth = { auth: { username: key, password: secret } };
    const parent = opts.parent != null && Number(opts.parent) >= 0 ? Number(opts.parent) : 0;

    const searchRes = await axios.get(`${base}/wp-json/wc/v3/products/categories`, {
        params: { search: name.slice(0, 80), per_page: 100 },
        ...auth,
        timeout: wooAxiosTimeout,
        validateStatus: () => true,
    });

    if (searchRes.status < 400 && Array.isArray(searchRes.data)) {
        const wanted = name.toLowerCase();
        const matches = searchRes.data.filter(
            (c: any) => String(c?.name ?? "").trim().toLowerCase() === wanted
        );
        const underParent = matches.find((c: any) => Number(c?.parent ?? 0) === parent);
        const pick = underParent ?? matches[0];
        if (pick?.id != null) {
            const id = Number(pick.id);
            if (id > 0) {
                if (cache != null) cache[ck] = id;
                return id;
            }
        }
    }

    const createRes = await axios.post(
        `${base}/wp-json/wc/v3/products/categories`,
        { name, parent },
        { ...auth, timeout: wooAxiosTimeout, validateStatus: () => true }
    );
    if (createRes.status >= 400) return undefined;
    const id = Number(createRes.data?.id);
    if (id > 0 && cache != null) cache[ck] = id;
    return id > 0 ? id : undefined;
}

async function findWooGlobalAttributeId(
    domain: string,
    key: string,
    secret: string,
    attributeDisplayName: string
): Promise<number | undefined> {
    const label = attributeDisplayName.trim();
    if (!label) return undefined;
    const base = wooBase(domain);
    const auth = { auth: { username: key, password: secret } };
    const res = await axios.get(`${base}/wp-json/wc/v3/products/attributes`, {
        params: { per_page: 100 },
        ...auth,
        timeout: wooAxiosTimeout,
        validateStatus: () => true,
    });
    if (res.status >= 400 || !Array.isArray(res.data)) return undefined;
    const wanted = label.toLowerCase();
    const hit = res.data.find((a: any) => String(a?.name ?? "").trim().toLowerCase() === wanted);
    const id = hit?.id != null ? Number(hit.id) : NaN;
    return Number.isFinite(id) && id > 0 ? id : undefined;
}

/**
 * Garantisce un termine sull’attributo globale Woo (es. "Brand" → pa_brand).
 * Se l’attributo non esiste come globale, restituisce undefined (il prodotto userà attributo locale).
 */
export async function ensureWooGlobalAttributeTerm(
    domain: string,
    key: string,
    secret: string,
    attributeDisplayName: string,
    termLabel: string,
    cache?: Record<string, number>
): Promise<{ attributeId: number; optionName: string } | undefined> {
    const term = termLabel.trim();
    if (!term) return undefined;
    const ck = normalizeWooResolveCacheKey(term);
    if (cache != null && cache[ck] != null && cache[ck]! > 0) {
        const attributeId = await findWooGlobalAttributeId(domain, key, secret, attributeDisplayName);
        if (attributeId == null) return undefined;
        return { attributeId, optionName: term };
    }

    const attributeId = await findWooGlobalAttributeId(domain, key, secret, attributeDisplayName);
    if (attributeId == null) return undefined;

    const base = wooBase(domain);
    const auth = { auth: { username: key, password: secret } };
    const termsUrl = `${base}/wp-json/wc/v3/products/attributes/${attributeId}/terms`;

    const listRes = await axios.get(termsUrl, {
        params: { search: term.slice(0, 80), per_page: 100 },
        ...auth,
        timeout: wooAxiosTimeout,
        validateStatus: () => true,
    });

    if (listRes.status < 400 && Array.isArray(listRes.data)) {
        const wanted = term.toLowerCase();
        const exact = listRes.data.find(
            (t: any) => String(t?.name ?? "").trim().toLowerCase() === wanted
        );
        if (exact?.id != null) {
            const tid = Number(exact.id);
            if (tid > 0 && cache != null) cache[ck] = tid;
            const nameOut = String(exact.name ?? term).trim() || term;
            return { attributeId, optionName: nameOut };
        }
    }

    const postRes = await axios.post(termsUrl, { name: term }, {
        ...auth,
        timeout: wooAxiosTimeout,
        validateStatus: () => true,
    });

    if (postRes.status < 400 && postRes.data?.id != null) {
        const tid = Number(postRes.data.id);
        if (tid > 0 && cache != null) cache[ck] = tid;
        const nameOut = String(postRes.data.name ?? term).trim() || term;
        return { attributeId, optionName: nameOut };
    }

    if (postRes.status === 400 && Array.isArray(postRes.data?.data?.resource_id)) {
        const list2 = await axios.get(termsUrl, {
            params: { per_page: 100, search: term.slice(0, 80) },
            ...auth,
            timeout: wooAxiosTimeout,
            validateStatus: () => true,
        });
        if (list2.status < 400 && Array.isArray(list2.data)) {
            const wanted = term.toLowerCase();
            const exact = list2.data.find(
                (t: any) => String(t?.name ?? "").trim().toLowerCase() === wanted
            );
            if (exact?.id != null) {
                const tid = Number(exact.id);
                if (tid > 0 && cache != null) cache[ck] = tid;
                return { attributeId, optionName: String(exact.name ?? term).trim() || term };
            }
        }
    }

    return undefined;
}

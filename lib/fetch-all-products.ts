import type { AxiosRequestConfig } from "axios";

/** Allineato al max lato API (`GET /api/products?take=…`). */
export const PRODUCTS_LIST_PAGE_SIZE = 400;
export const PRODUCTS_LIST_MAX_TAKE = 500;

type AxiosGet = <T = unknown>(
    url: string,
    config?: AxiosRequestConfig
) => Promise<{ data: T }>;

/**
 * Scarica tutti i prodotti con paginazione server-side (`take`/`skip`).
 * Se il server risponde ancora con un array (legacy), lo restituisce così com'è.
 */
export async function fetchAllProductsPages(
    get: AxiosGet,
    companyReq: AxiosRequestConfig = {},
    opts?: { pageSize?: number; timeoutMs?: number; signal?: AbortSignal }
): Promise<any[]> {
    const pageSize = Math.min(
        Math.max(opts?.pageSize ?? PRODUCTS_LIST_PAGE_SIZE, 1),
        PRODUCTS_LIST_MAX_TAKE
    );
    const timeout = opts?.timeoutMs ?? 120_000;
    const all: any[] = [];
    let skip = 0;
    let guard = 0;
    const maxPages = 10000;

    while (guard++ < maxPages) {
        const res = await get<any>(
            `/api/products?take=${pageSize}&skip=${skip}`,
            { ...companyReq, timeout, signal: opts?.signal }
        );
        const data = res.data;
        if (Array.isArray(data)) {
            return data;
        }
        const chunk = Array.isArray(data?.products) ? data.products : [];
        if (chunk.length === 0) break;
        all.push(...chunk);
        if (!data?.hasMore) break;
        skip += chunk.length;
    }

    return all;
}

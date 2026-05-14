/**
 * Modello dati del modulo SEO & GEO Hub (persistito in Company.seoGeoHub).
 * Estendibile senza migration: nuovi campi opzionali nel JSON.
 */

export type SeoGeoHubSeo = {
    primaryKeywords?: string;
    titleFormula?: string;
    editorialNotes?: string;
    /** Lingue contenuti (es. it, en) */
    contentLocales?: string[];
};

export type SeoGeoHubGeo = {
    locationName?: string;
    street?: string;
    city?: string;
    postalCode?: string;
    region?: string;
    /** ISO 3166-1 alpha-2 */
    countryCode?: string;
    lat?: number | null;
    lng?: number | null;
    serviceArea?: string;
    /** URL uno per riga */
    sameAsUrls?: string;
    geoNotes?: string;
};

/** IndexNow + ping sitemap dopo sync canali (richiede chiave sul dominio del negozio). */
export type SeoGeoHubIndexing = {
    /** Se true, dopo push Woo/Presta esegue IndexNow + ping sitemap (se configurati). */
    autoSubmitOnChannelSync?: boolean;
    indexNowEnabled?: boolean;
    /** Host canonical del sito vetrina (es. www.mionegozio.it) senza protocollo. */
    indexNowHost?: string;
    /** Chiave IndexNow (file key.txt pubblicato sul sito). */
    indexNowKey?: string;
    /** URL completo del file chiave se non è nella root standard. */
    indexNowKeyLocation?: string;
    /** URL pubblico della sitemap XML (ping Google/Bing legacy). */
    sitemapUrl?: string;
    pingSitemapOnSync?: boolean;
};

/** Visibilità verso crawler / assistenti (file llms.txt da pubblicare sul dominio). */
export type SeoGeoHubAiDiscovery = {
    /** Descrizione breve brand per blocchi llms.txt */
    brandSummaryForAi?: string;
    /** Argomenti da mettere in evidenza per ricerche conversazionali */
    topicalFocus?: string;
};

export type SeoGeoHubPayload = {
    seo: SeoGeoHubSeo;
    geo: SeoGeoHubGeo;
    indexing?: SeoGeoHubIndexing;
    aiDiscovery?: SeoGeoHubAiDiscovery;
};

const MAX_STR = 8000;
const MAX_LOCALES = 12;

function clampStr(s: unknown, max = MAX_STR): string {
    if (typeof s !== "string") return "";
    return s.trim().slice(0, max);
}

function parseLocales(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
        const t = String(x).trim().toLowerCase().replace(/[^a-z-]/g, "").slice(0, 12);
        if (t && !out.includes(t)) out.push(t);
        if (out.length >= MAX_LOCALES) break;
    }
    return out;
}

function parseCoord(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

function parseBool(v: unknown, fallback = false): boolean {
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return fallback;
}

export function defaultSeoGeoHubPayload(): SeoGeoHubPayload {
    return {
        seo: {},
        geo: {},
        indexing: {
            autoSubmitOnChannelSync: false,
            indexNowEnabled: false,
            pingSitemapOnSync: false,
        },
        aiDiscovery: {},
    };
}

/** Normalizza input client / JSON legacy in un payload sicuro. */
export function sanitizeSeoGeoHubInput(raw: unknown): SeoGeoHubPayload {
    const base = defaultSeoGeoHubPayload();
    if (!raw || typeof raw !== "object") return base;
    const o = raw as Record<string, unknown>;
    const seo = o.seo && typeof o.seo === "object" ? (o.seo as Record<string, unknown>) : {};
    const geo = o.geo && typeof o.geo === "object" ? (o.geo as Record<string, unknown>) : {};
    const indexing =
        o.indexing && typeof o.indexing === "object" ? (o.indexing as Record<string, unknown>) : {};
    const aiDiscovery =
        o.aiDiscovery && typeof o.aiDiscovery === "object"
            ? (o.aiDiscovery as Record<string, unknown>)
            : {};

    return {
        seo: {
            primaryKeywords: clampStr(seo.primaryKeywords),
            titleFormula: clampStr(seo.titleFormula, 2000),
            editorialNotes: clampStr(seo.editorialNotes),
            contentLocales: parseLocales(seo.contentLocales),
        },
        geo: {
            locationName: clampStr(geo.locationName, 500),
            street: clampStr(geo.street, 500),
            city: clampStr(geo.city, 200),
            postalCode: clampStr(geo.postalCode, 32),
            region: clampStr(geo.region, 200),
            countryCode: clampStr(geo.countryCode, 4).toUpperCase().slice(0, 2) || undefined,
            lat: parseCoord(geo.lat),
            lng: parseCoord(geo.lng),
            serviceArea: clampStr(geo.serviceArea),
            sameAsUrls: clampStr(geo.sameAsUrls),
            geoNotes: clampStr(geo.geoNotes),
        },
        indexing: {
            autoSubmitOnChannelSync: parseBool(indexing.autoSubmitOnChannelSync, false),
            indexNowEnabled: parseBool(indexing.indexNowEnabled, false),
            indexNowHost: clampStr(indexing.indexNowHost, 253),
            indexNowKey: clampStr(indexing.indexNowKey, 128),
            indexNowKeyLocation: clampStr(indexing.indexNowKeyLocation, 2048),
            sitemapUrl: clampStr(indexing.sitemapUrl, 2048),
            pingSitemapOnSync: parseBool(indexing.pingSitemapOnSync, false),
        },
        aiDiscovery: {
            brandSummaryForAi: clampStr(aiDiscovery.brandSummaryForAi, 4000),
            topicalFocus: clampStr(aiDiscovery.topicalFocus, 4000),
        },
    };
}

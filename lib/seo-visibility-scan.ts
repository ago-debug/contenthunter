/**
 * Snapshot “stile Semrush”: posizioni approssimative su Google (SerpAPI) + euristiche homepage.
 * Senza SerpAPI: solo allineamento keyword ↔ titolo/meta/H1 e suggerimenti operativi.
 */

import { normalizePublicSiteUrl } from "@/lib/technical-site-audit";

export type VisibilityScanMode = "serpapi" | "heuristic_only";

export type VisibilityKeywordRow = {
    keyword: string;
    /** Posizione 1–N nei risultati organici SerpAPI, null se fuori range o non disponibile */
    googlePosition: number | null;
    /** URL del risultato organico che coincide col dominio (se trovato) */
    matchedUrl: string | null;
    /** Titolo snippet SERP */
    serpTitle: string | null;
    /** true se keyword compare (case-insensitive) in titolo homepage */
    inHomeTitle: boolean;
    /** in meta description */
    inHomeMetaDescription: boolean;
    /** in primo H1 */
    inHomeH1: boolean;
};

export type VisibilityScanResult = {
    mode: VisibilityScanMode;
    siteOrigin: string;
    scannedAt: string;
    targetHost: string;
    rows: VisibilityKeywordRow[];
    /** Suggerimenti prioritizzati (testo breve) */
    recommendations: string[];
    /** Messaggio informativo (es. SerpAPI assente) */
    notice?: string;
};

export const VISIBILITY_SERP_DEPTH = 30;
const MAX_KEYWORDS = 8;
const SERP_NUM = VISIBILITY_SERP_DEPTH;
const UA = "Iris-SeoVisibility/1.0 (+SEO-GEO-Hub)";

function stripWww(host: string): string {
    const h = host.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
}

export function parseKeywordList(primaryKeywords: string, extraLines?: string): string[] {
    const raw = [primaryKeywords, extraLines || ""].join("\n");
    const parts = raw
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length <= 80);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
        const k = p.slice(0, 80);
        const low = k.toLowerCase();
        if (seen.has(low)) continue;
        seen.add(low);
        out.push(k);
        if (out.length >= MAX_KEYWORDS) break;
    }
    return out;
}

function hostMatchesResult(resultLink: string, targetHostNorm: string): boolean {
    try {
        const h = stripWww(new URL(resultLink).hostname);
        const t = stripWww(targetHostNorm);
        if (h === t) return true;
        if (h.endsWith("." + t)) return true;
        return false;
    } catch {
        return false;
    }
}

type OrganicItem = { position?: number; link?: string; title?: string };

function findOrganicPositionForHost(organic: OrganicItem[] | undefined, targetHostNorm: string) {
    if (!organic?.length) return { position: null as number | null, matchedUrl: null as string | null, serpTitle: null as string | null };
    for (const item of organic) {
        const link = typeof item.link === "string" ? item.link : "";
        if (!link || !hostMatchesResult(link, targetHostNorm)) continue;
        const pos = typeof item.position === "number" && item.position > 0 ? item.position : null;
        return {
            position: pos,
            matchedUrl: link,
            serpTitle: typeof item.title === "string" ? item.title.slice(0, 200) : null,
        };
    }
    return { position: null, matchedUrl: null, serpTitle: null };
}

async function fetchSerpOrganic(keyword: string, apiKey: string, gl: string, hl: string): Promise<OrganicItem[] | null> {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("engine", "google");
    u.searchParams.set("q", keyword);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("num", String(SERP_NUM));
    if (gl) u.searchParams.set("gl", gl.slice(0, 2).toLowerCase());
    if (hl) u.searchParams.set("hl", hl.slice(0, 5).toLowerCase());

    const r = await fetch(u.toString(), {
        method: "GET",
        headers: { "User-Agent": UA },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
    });
    const json = (await r.json()) as { organic_results?: OrganicItem[]; error?: string };
    if (!r.ok || json.error) {
        console.warn("[seo-visibility] SerpAPI error", r.status, json.error);
        return null;
    }
    return Array.isArray(json.organic_results) ? json.organic_results : [];
}

type HomeSignals = { title: string; metaDesc: string; h1: string };

async function fetchHomeSignals(origin: string): Promise<HomeSignals | null> {
    const base = normalizePublicSiteUrl(origin);
    if (!base) return null;
    try {
        const r = await fetch(`${base}/`, {
            method: "GET",
            redirect: "follow",
            headers: { "User-Agent": UA, Accept: "text/html" },
            cache: "no-store",
            signal: AbortSignal.timeout(14_000),
        });
        if (!r.ok) return null;
        const html = (await r.text()).slice(0, 200_000);
        const titleM = html.match(/<title[^>]*>([^<]{1,400})<\/title>/i);
        const title = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";
        const metaM = html.match(
            /<meta[^>]+name=["']description["'][^>]*content=["']([^"']{1,500})["'][^>]*>/i
        );
        const metaM2 = html.match(
            /<meta[^>]+content=["']([^"']{1,500})["'][^>]*name=["']description["'][^>]*>/i
        );
        const metaDesc = (metaM?.[1] || metaM2?.[1] || "").replace(/\s+/g, " ").trim();
        const h1M = html.match(/<h1[^>]*>([\s\S]{0,800}?)<\/h1>/i);
        let h1 = "";
        if (h1M) {
            h1 = h1M[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
        }
        return { title, metaDesc, h1 };
    } catch {
        return null;
    }
}

function containsKw(haystack: string, keyword: string): boolean {
    if (!haystack || !keyword) return false;
    return haystack.toLowerCase().includes(keyword.toLowerCase());
}

function buildRecommendations(
    rows: VisibilityKeywordRow[],
    home: HomeSignals | null,
    mode: VisibilityScanMode
): string[] {
    const rec: string[] = [];

    if (mode === "heuristic_only") {
        rec.push(
            "Configura la chiave SerpAPI in Impostazioni azienda per vedere le posizioni approssimative su Google (come in uno strumento tipo Semrush)."
        );
    }

    if (!home || (!home.title && !home.metaDesc)) {
        rec.push("Impossibile leggere titolo/meta dalla homepage: verifica che il sito risponda in HTML e non blocchi i bot.");
    }

    const weak = rows.filter((r) => r.googlePosition == null || r.googlePosition > 10);
    const top3 = rows.filter((r) => r.googlePosition != null && r.googlePosition <= 3);
    if (top3.length > 0) {
        rec.push(`Ottimo: ${top3.length} keyword risultano nei primi 3 risultati Google — mantieni contenuti e internal linking su quelle pagine.`);
    }
    if (weak.length > 0 && mode === "serpapi") {
        rec.push(
            `Per ${weak.length} keyword il dominio è fuori dai primi ${SERP_NUM} risultati o assente: valuta pagine dedicate, blog, schede categoria e FAQ ottimizzate.`
        );
    }

    const missTitle = rows.filter((r) => !r.inHomeTitle).map((r) => r.keyword);
    if (missTitle.length && home?.title) {
        rec.push(
            `Titolo homepage: mancano (o sono deboli) queste keyword rispetto al piano: ${missTitle.slice(0, 5).join(" · ")}${missTitle.length > 5 ? "…" : ""}.`
        );
    }
    const missMeta = rows.filter((r) => !r.inHomeMetaDescription).map((r) => r.keyword);
    if (missMeta.length && home?.metaDesc) {
        rec.push(
            `Meta description: rafforza il legame con: ${missMeta.slice(0, 5).join(" · ")}${missMeta.length > 5 ? "…" : ""} (CTR in SERP).`
        );
    }
    const missH1 = rows.filter((r) => !r.inHomeH1).map((r) => r.keyword);
    if (missH1.length && home?.h1) {
        rec.push(`H1 principale: allinea l’intento di ricerca per: ${missH1.slice(0, 5).join(" · ")}${missH1.length > 5 ? "…" : ""}.`);
    }

    rec.push("Completa il piano keyword in questa pagina, allinea titoli prodotto in Biblioteca e assicurati che la sitemap sia inviata (blocco indicizzazione).");
    rec.push("Per SEO locale, verifica che NAP (nome, indirizzo, telefono) sia coerente tra sito, Google Business e canali Iris.");

    return Array.from(new Set(rec)).slice(0, 24);
}

export type RunVisibilityScanParams = {
    siteInput: string;
    keywordsText: string;
    serpApiKey: string;
    gl?: string;
    hl?: string;
};

export async function runVisibilityScan(params: RunVisibilityScanParams): Promise<VisibilityScanResult | { error: string }> {
    const origin = normalizePublicSiteUrl(params.siteInput);
    if (!origin) {
        return { error: "URL negozio non valido o host non consentito." };
    }

    let targetHost: string;
    try {
        targetHost = stripWww(new URL(origin).hostname);
    } catch {
        return { error: "URL negozio non valido." };
    }

    const keywords = parseKeywordList(params.keywordsText);
    if (keywords.length === 0) {
        return { error: "Inserisci almeno una keyword (campo «Keyword primarie» o testo nell’analisi visibilità)." };
    }

    const home = await fetchHomeSignals(origin);
    const gl = (params.gl || "it").trim().slice(0, 2) || "it";
    const hl = (params.hl || "it").trim().slice(0, 5) || "it";
    const hasSerp = !!params.serpApiKey.trim();

    const rows: VisibilityKeywordRow[] = [];
    const mode: VisibilityScanMode = hasSerp ? "serpapi" : "heuristic_only";

    for (const keyword of keywords) {
        let googlePosition: number | null = null;
        let matchedUrl: string | null = null;
        let serpTitle: string | null = null;

        if (hasSerp) {
            const organic = await fetchSerpOrganic(keyword, params.serpApiKey.trim(), gl, hl);
            if (organic) {
                const found = findOrganicPositionForHost(organic, targetHost);
                googlePosition = found.position;
                matchedUrl = found.matchedUrl;
                serpTitle = found.serpTitle;
            }
            await new Promise((r) => setTimeout(r, 350));
        }

        rows.push({
            keyword,
            googlePosition,
            matchedUrl,
            serpTitle,
            inHomeTitle: containsKw(home?.title || "", keyword),
            inHomeMetaDescription: containsKw(home?.metaDesc || "", keyword),
            inHomeH1: containsKw(home?.h1 || "", keyword),
        });
    }

    const recommendations = buildRecommendations(rows, home, mode);
    const notice =
        mode === "heuristic_only"
            ? "Modalità senza SerpAPI: nessuna posizione Google reale; suggerimenti basati su homepage e best practice."
            : `SerpAPI: prime ${SERP_NUM} posizioni organiche per query (Google può variare per utente/locale).`;

    return {
        mode,
        siteOrigin: origin,
        scannedAt: new Date().toISOString(),
        targetHost,
        rows,
        recommendations,
        notice,
    };
}

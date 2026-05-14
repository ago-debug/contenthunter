/**
 * Audit tecnico read-only verso il dominio pubblico del negozio (nessuna autenticazione admin).
 * Mitiga SSRF: solo URL http/https con host pubblico.
 */

export type TechnicalAuditCheck = {
    id: string;
    label: string;
    ok: boolean;
    detail: string;
};

export type TechnicalAuditResult = {
    baseUrl: string;
    /** URL finale dopo redirect */
    finalOrigin: string;
    checkedAt: string;
    checks: TechnicalAuditCheck[];
    /** Prima sitemap XML trovata (200) tra candidati + eventuale URL già salvato in Hub */
    suggestedSitemapUrl: string | null;
    recommendations: string[];
};

const UA = "Iris-TechnicalAudit/1.0 (+SEO-GEO-Hub)";

function isSafePublicUrl(href: string): boolean {
    try {
        const u = new URL(href);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        const h = u.hostname.toLowerCase();
        if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
        if (h === "0.0.0.0" || h === "[::1]" || h === "127.0.0.1") return false;
        if (/^10\.\d+\.\d+\.\d+$/.test(h)) return false;
        if (/^192\.168\.\d+\.\d+$/.test(h)) return false;
        if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return false;
        if (/^169\.254\.\d+\.\d+$/.test(h)) return false;
        return true;
    } catch {
        return false;
    }
}

/** Normalizza input utente in origin https://host (path ignorato per la base). */
export function normalizePublicSiteUrl(raw: string): string | null {
    let s = raw.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!isSafePublicUrl(u.href)) return null;
        return u.origin;
    } catch {
        return null;
    }
}

async function fetchProbe(
    url: string,
    timeoutMs: number,
    opts?: { wantText?: boolean }
): Promise<{ ok: boolean; status: number; ms: number; finalUrl: string; textSample?: string }> {
    const t0 = Date.now();
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), timeoutMs);
    try {
        if (!isSafePublicUrl(url)) {
            return { ok: false, status: 0, ms: 0, finalUrl: url };
        }
        const r = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: c.signal,
            headers: { "User-Agent": UA, Accept: "*/*" },
            cache: "no-store",
        });
        const ms = Date.now() - t0;
        const finalUrl = r.url || url;
        let textSample: string | undefined;
        if (opts?.wantText && r.ok) {
            const ct = r.headers.get("content-type") || "";
            if (ct.includes("text/html") || ct.includes("xml") || ct.includes("plain")) {
                const t = await r.text();
                textSample = t.slice(0, 120_000);
            }
        }
        const ok = r.status >= 200 && r.status < 400;
        return { ok, status: r.status, ms, finalUrl, textSample };
    } catch {
        const ms = Date.now() - t0;
        return { ok: false, status: 0, ms, finalUrl: url };
    } finally {
        clearTimeout(id);
    }
}

export async function runTechnicalSiteAudit(
    rawSiteInput: string,
    opts?: { configuredSitemapUrl?: string | null }
): Promise<TechnicalAuditResult | { error: string }> {
    const base = normalizePublicSiteUrl(rawSiteInput);
    if (!base) {
        return { error: "URL non valido o host non consentito per l’analisi." };
    }

    const checkedAt = new Date().toISOString();
    const checks: TechnicalAuditCheck[] = [];
    const recommendations: string[] = [];

    const home = await fetchProbe(`${base}/`, 14_000, { wantText: true });
    const finalOrigin = (() => {
        try {
            return new URL(home.finalUrl).origin;
        } catch {
            return base;
        }
    })();

    checks.push({
        id: "reachable",
        label: "Homepage raggiungibile",
        ok: home.status >= 200 && home.status < 400,
        detail:
            home.status > 0
                ? `HTTP ${home.status} · ~${home.ms} ms`
                : `Timeout o errore di rete (~${home.ms} ms)`,
    });
    if (!checks[checks.length - 1].ok) {
        recommendations.push("Verifica che il dominio sia online, senza firewall che blocca bot o IP server Iris.");
    }

    const httpsOk = finalOrigin.startsWith("https:");
    checks.push({
        id: "https",
        label: "HTTPS",
        ok: httpsOk,
        detail: httpsOk ? "Connessione su HTTPS" : "Il sito risponde in HTTP o con redirect incoerente — preferisci HTTPS.",
    });
    if (!httpsOk) {
        recommendations.push("Abilita certificato SSL e reindirizzamento verso HTTPS sul dominio del negozio.");
    }

    let titleDetail = "Titolo non estratto";
    if (home.textSample) {
        const m = home.textSample.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
        if (m) titleDetail = m[1].replace(/\s+/g, " ").trim().slice(0, 160);
    }
    checks.push({
        id: "title",
        label: "Titolo homepage (meta title)",
        ok: titleDetail !== "Titolo non estratto" && titleDetail.length >= 3,
        detail: titleDetail,
    });
    if (titleDetail === "Titolo non estratto") {
        recommendations.push("Assicurati che la homepage restituisca HTML con un titolo descrittivo.");
    }

    const robots = await fetchProbe(`${finalOrigin}/robots.txt`, 10_000);
    checks.push({
        id: "robots",
        label: "robots.txt",
        ok: robots.status === 200,
        detail: robots.status === 200 ? "Trovato" : robots.status === 404 ? "Non trovato (404)" : `HTTP ${robots.status}`,
    });

    const llms = await fetchProbe(`${finalOrigin}/llms.txt`, 10_000);
    checks.push({
        id: "llms",
        label: "llms.txt (root)",
        ok: llms.status === 200,
        detail:
            llms.status === 200
                ? "Pubblicato sul dominio"
                : "Assente — puoi generarlo da Iris e caricarlo nella root del sito.",
    });
    if (llms.status !== 200) {
        recommendations.push("Scarica llms.txt dal blocco «Scoperta IA» in questa pagina e pubblicalo su /llms.txt.");
    }

    const tried = new Set<string>();
    const candidates: string[] = [];
    const cfg = opts?.configuredSitemapUrl?.trim();
    if (cfg && /^https?:\/\//i.test(cfg)) {
        candidates.push(cfg);
    }
    for (const p of [
        `${finalOrigin}/wp-sitemap.xml`,
        `${finalOrigin}/sitemap.xml`,
        `${finalOrigin}/sitemap_index.xml`,
        `${finalOrigin}/index.php?controller=sitemap`,
    ]) {
        if (!tried.has(p)) {
            tried.add(p);
            candidates.push(p);
        }
    }

    let suggestedSitemapUrl: string | null = null;
    for (const u of candidates) {
        const sm = await fetchProbe(u, 10_000, { wantText: true });
        if (sm.status === 200 && sm.textSample && /<urlset|<sitemapindex/i.test(sm.textSample)) {
            suggestedSitemapUrl = sm.finalUrl.split("?")[0] || sm.finalUrl;
            break;
        }
    }

    checks.push({
        id: "sitemap",
        label: "Sitemap XML",
        ok: suggestedSitemapUrl != null,
        detail: suggestedSitemapUrl ?? "Non rilevata automaticamente — incolla l’URL della sitemap nelle impostazioni sotto.",
    });
    if (!suggestedSitemapUrl) {
        recommendations.push("Inserisci manualmente l’URL della sitemap (es. WooCommerce: .../wp-sitemap.xml).");
    }

    return {
        baseUrl: base,
        finalOrigin,
        checkedAt,
        checks,
        suggestedSitemapUrl,
        recommendations: Array.from(new Set(recommendations)),
    };
}

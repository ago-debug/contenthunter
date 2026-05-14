import "@/lib/node-file-polyfill";
import * as cheerio from "cheerio";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 80_000;

function isBlockedHostname(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".localhost")) return true;
    if (h.endsWith(".local")) return true;
    if (h === "metadata.google.internal" || h.endsWith(".metadata.google.internal")) return true;
    // Block numeric hostnames (IPv4) — reduces SSRF via internal IPs
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
        const p = h.split(".").map((x) => parseInt(x, 10));
        if (p.length === 4 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
            if (p[0] === 10) return true;
            if (p[0] === 127) return true;
            if (p[0] === 0) return true;
            if (p[0] === 169 && p[1] === 254) return true;
            if (p[0] === 192 && p[1] === 168) return true;
            if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
            // Public IPs still risky for port-scanning; block all literal IPs
            return true;
        }
    }
    return false;
}

export function assertSafeHttpUrl(input: string): URL {
    let u: URL;
    try {
        u = new URL(input.trim());
    } catch {
        throw new Error("URL non valida.");
    }
    if (u.username || u.password) throw new Error("URL con credenziali non consentita.");
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Sono ammessi solo URL http/https.");
    }
    if (isBlockedHostname(u.hostname)) {
        throw new Error("Host non consentito per motivi di sicurezza.");
    }
    return u;
}

export type FetchUrlPlainResult = { title: string | null; text: string; finalUrl: string };

/**
 * Scarica una pagina pubblica e restituisce testo leggibile (HTML → testo con cheerio).
 */
export async function fetchUrlAsPlainText(urlStr: string): Promise<FetchUrlPlainResult> {
    const u = assertSafeHttpUrl(urlStr);
    const res = await fetch(u.toString(), {
        redirect: "follow",
        headers: {
            "User-Agent": "IrisNotebookMapper/1.0",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error("Risposta troppo grande (max 2 MB).");
    }
    const finalUrl = res.url || u.toString();
    const finalParsed = new URL(finalUrl);
    if (isBlockedHostname(finalParsed.hostname)) {
        throw new Error("Redirect verso host non consentito.");
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const raw = Buffer.from(buf).toString("utf8");

    if (ct.includes("text/plain") || ct.includes("application/json")) {
        return {
            title: null,
            text: raw.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS),
            finalUrl,
        };
    }

    const $ = cheerio.load(raw);
    $("script, style, noscript, svg").remove();
    const title = $("title").first().text().replace(/\s+/g, " ").trim() || null;
    const text = $.root()
        .text()
        .replace(/\u0000/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_TEXT_CHARS);
    return { title, text, finalUrl };
}

import dns from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = new Set(
    [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
        "metadata",
        "kubernetes",
        "kubernetes.default",
        "kubernetes.default.svc",
    ].map((h) => h.toLowerCase())
);

function isPrivateIPv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
}

function isBlockedIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    return false;
}

/**
 * Verifica che l'URL sia utilizzabile dal proxy immagini senza SSRF verso reti interne.
 * Opzionale: PROXY_IMAGE_ALLOWED_HOSTS (comma-separated) — se impostato, solo quegli host sono ammessi.
 */
export async function assertSafeProxyImageUrl(urlString: string): Promise<void> {
    let u: URL;
    try {
        u = new URL(urlString);
    } catch {
        throw new Error("URL non valida");
    }

    if (u.username || u.password) {
        throw new Error("URL con credenziali non consentita");
    }

    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Solo http e https sono consentiti");
    }

    const hostname = u.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) {
        throw new Error("Host non consentito");
    }

    const allowlist = process.env.PROXY_IMAGE_ALLOWED_HOSTS?.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (allowlist && allowlist.length > 0) {
        if (!allowlist.includes(hostname)) {
            throw new Error("Host non incluso in PROXY_IMAGE_ALLOWED_HOSTS");
        }
    }

    if (net.isIPv4(hostname)) {
        if (isPrivateIPv4(hostname)) {
            throw new Error("Indirizzo IP privato non consentito");
        }
        return;
    }

    if (net.isIPv6(hostname)) {
        if (isBlockedIPv6(hostname)) {
            throw new Error("Indirizzo IPv6 non consentito");
        }
        return;
    }

    try {
        const results = await dns.lookup(hostname, { all: true });
        for (const { address, family } of results) {
            if (family === 4 && isPrivateIPv4(address)) {
                throw new Error("Il dominio risolve a un indirizzo privato");
            }
            if (family === 6 && isBlockedIPv6(address)) {
                throw new Error("Il dominio risolve a un indirizzo IPv6 non consentito");
            }
        }
    } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith("Il dominio risolve")) {
            throw e;
        }
        throw new Error("Risoluzione DNS non riuscita o host non valido");
    }
}

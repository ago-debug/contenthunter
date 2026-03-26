/**
 * Normalizza la chiave Gemini salvata dall'utente: spesso viene incollato l'URL completo
 * o una riga tipo https://...?key=AIza...
 * L'SDK si aspetta solo la stringa AIza...
 */
export function normalizeGeminiApiKey(input: string | null | undefined): string {
    const raw = String(input ?? "").trim();
    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            const q = u.searchParams.get("key");
            if (q?.trim()) return q.trim();
        } catch {
            /* fall through */
        }
        const m = raw.match(/(AIza[0-9A-Za-z_-]{30,})/);
        if (m) return m[1];
        return "";
    }

    const standalone = raw.match(/^(AIza[0-9A-Za-z_-]{30,})$/);
    if (standalone) return standalone[1];

    const embedded = raw.match(/(AIza[0-9A-Za-z_-]{30,})/);
    return embedded ? embedded[1] : raw;
}

/** Base URL senza path di versione (l'SDK aggiunge /v1beta/... da solo). */
export function normalizeGeminiBaseUrl(input: string | null | undefined): string | undefined {
    const raw = String(input ?? "").trim();
    if (!raw) return undefined;
    let s = raw.replace(/\/+$/, "");
    if (/\/v1beta$/i.test(s)) s = s.replace(/\/v1beta$/i, "");
    if (/^https?:\/\//i.test(s)) return s;
    return undefined;
}

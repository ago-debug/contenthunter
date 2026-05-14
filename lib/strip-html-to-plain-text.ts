/**
 * Converte contenuti HTML delle schede prodotto in testo leggibile:
 * rimuove tag, ignora script/style, decodifica entità HTML comuni.
 */

const NAMED_ENTITIES_NO_AMP: Record<string, string> = {
    nbsp: " ",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    copy: "\u00a9",
    reg: "\u00ae",
};

function decodeHtmlEntitiesNode(text: string): string {
    let s = text.replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => {
        const cp = parseInt(hex, 16);
        try {
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
        } catch {
            return m;
        }
    });
    s = s.replace(/&#(\d+);/g, (m, dec: string) => {
        const cp = parseInt(dec, 10);
        try {
            return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
        } catch {
            return m;
        }
    });
    for (const [name, ch] of Object.entries(NAMED_ENTITIES_NO_AMP)) {
        s = s.replace(new RegExp(`&${name};`, "gi"), ch);
    }
    s = s.replace(/&amp;/gi, "&");
    return s;
}

function decodeHtmlEntities(text: string): string {
    if (typeof document !== "undefined") {
        const el = document.createElement("textarea");
        el.innerHTML = text;
        return el.value;
    }
    return decodeHtmlEntitiesNode(text);
}

export type StripHtmlToPlainTextOptions = {
    /**
     * Se true (default), sostituisce `<br>` e chiusure blocco note con newline
     * prima di rimuovere i tag, così il testo non diventa un'unica riga.
     */
    keepLineBreaks?: boolean;
};

/**
 * Rimuove i tag HTML e restituisce testo piano, con spaziature normalizzate.
 */
export function stripHtmlToPlainText(
    input: string | null | undefined,
    options?: StripHtmlToPlainTextOptions
): string {
    if (input == null) return "";
    let s = String(input);
    if (!s.trim()) return "";

    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

    const keepLineBreaks = options?.keepLineBreaks !== false;

    if (keepLineBreaks) {
        s = s.replace(/<br\s*\/?>/gi, "\n");
        s = s.replace(/<\/(p|div|h[1-6]|li|tr)\s*>/gi, "\n");
    }

    s = s.replace(/<[^>]+>/g, "");
    s = decodeHtmlEntities(s);

    s = s.replace(/\u00a0/g, " ");

    if (keepLineBreaks) {
        s = s.replace(/[ \t]+\n/g, "\n");
        s = s.replace(/\n{3,}/g, "\n\n");
        s = s.replace(/[ \t]{2,}/g, " ");
    } else {
        s = s.replace(/\s+/g, " ");
    }

    return s.trim();
}

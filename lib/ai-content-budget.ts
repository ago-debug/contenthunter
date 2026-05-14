/**
 * Limiti condivisi per generazione contenuti prodotto (Gemini / OpenAI-compat).
 * Obiettivo: meno token in ingresso/uscita senza cambiare il modello di default.
 *
 * Override output: OPENAI_PRODUCT_COPY_MAX_TOKENS_FAST / OPENAI_PRODUCT_COPY_MAX_TOKENS_FULL (numero o vuoto = usa tabella).
 * Soglia sorgente / skip: `lib/ai-seo-source-material.ts` (AI_SEO_MIN_SOURCE_CHARS, AI_SEO_SKIP_THIN_SOURCE).
 */

export const AI_PRODUCT_COPY_FAST = {
    docDescriptionMaxChars: 420,
    brandGuidelinesMaxChars: 220,
    extraFieldsMaxChars: 220,
} as const;

export const AI_PRODUCT_COPY_FULL = {
    docDescriptionMaxChars: 1600,
    brandGuidelinesMaxChars: 900,
    extraFieldsMaxChars: 700,
} as const;

function parseCap(envVal: string | undefined, fallback: number): number {
    const n = parseInt(String(envVal || "").trim(), 10);
    return Number.isFinite(n) && n >= 50 ? n : fallback;
}

/**
 * max_tokens per una singola chat completion che produce short+desc+bullets (o sottoinsieme).
 */
export function maxOutputTokensProductCopy(requestedBlockCount: number, fastMode: boolean): number {
    const n = Math.max(1, Math.min(3, requestedBlockCount));
    if (fastMode) {
        const cap = parseCap(process.env.OPENAI_PRODUCT_COPY_MAX_TOKENS_FAST, 200);
        const per = 64;
        const min = 60;
        return Math.min(cap, Math.max(min, per * n));
    }
    const cap = parseCap(process.env.OPENAI_PRODUCT_COPY_MAX_TOKENS_FULL, 380);
    const per = 110;
    const min = 120;
    return Math.min(cap, Math.max(min, per * n));
}

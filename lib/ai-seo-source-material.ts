/**
 * Evita chiamate AI inutili quando mancano titolo, doc tecnica ed extra utili.
 *
 * Env:
 * - `AI_SEO_SKIP_THIN_SOURCE` — default `true`. Imposta `false` per forzare comunque la generazione.
 * - `AI_SEO_MIN_SOURCE_CHARS` — soglia minima (somma «segnale» su titolo+doc+extra+sku/ean), default 32.
 * - `AI_SEO_ALLOW_THIN_SOURCE` — alias esplicito `true` come `AI_SEO_SKIP_THIN_SOURCE=false`.
 */

/** Sotto questa somma (titolo+doc+extra+id) non chiamiamo il modello, salvo override env. */
const DEFAULT_MIN = 32;

export function productSeoSourceMaterialScore(input: {
    title?: string | null;
    docDescription?: string | null;
    extraFieldsPreview?: string | null;
    sku?: string | null;
    ean?: string | null;
    brand?: string | null;
    category?: string | null;
}): number {
    const t = String(input.title ?? "").trim().length;
    const d = String(input.docDescription ?? "").trim().length;
    const x = String(input.extraFieldsPreview ?? "").trim().length;
    const idLen = Math.min(40, String(input.sku ?? "").trim().length + String(input.ean ?? "").trim().length);
    const bc = Math.min(
        48,
        String(input.brand ?? "").trim().length + String(input.category ?? "").trim().length
    );
    return t + d + x + Math.floor(idLen / 2) + Math.floor(bc / 2);
}

export function thinSourceSkipEnabled(): boolean {
    if ((process.env.AI_SEO_ALLOW_THIN_SOURCE || "").trim().toLowerCase() === "true") {
        return false;
    }
    const v = (process.env.AI_SEO_SKIP_THIN_SOURCE || "true").trim().toLowerCase();
    return v !== "false" && v !== "0" && v !== "no";
}

export function minSourceCharsForSeo(): number {
    const n = parseInt(process.env.AI_SEO_MIN_SOURCE_CHARS || "", 10);
    return Number.isFinite(n) && n >= 8 ? n : DEFAULT_MIN;
}

export function shouldSkipSeoForThinSource(score: number): boolean {
    return thinSourceSkipEnabled() && score < minSourceCharsForSeo();
}

/** Lanciata da API/lib SEO quando non conviene chiamare il modello (risparmio costi). */
export class ThinSourceSkippedError extends Error {
    readonly code = "THIN_SOURCE" as const;
    readonly score: number;
    constructor(score: number) {
        const min = minSourceCharsForSeo();
        super(
            `Origine insufficiente per SEO AI (segnale ${score}/${min}). Aggiungi titolo, descrizione tecnica o campi extra. Sul server: AI_SEO_ALLOW_THIN_SOURCE=true per forzare comunque.`
        );
        this.name = "ThinSourceSkippedError";
        this.score = score;
    }
}

export function assertSeoSourceSufficientOrThrow(input: {
    title?: string | null;
    docDescription?: string | null;
    extraFieldsPreview?: string | null;
    sku?: string | null;
    ean?: string | null;
    brand?: string | null;
    category?: string | null;
}): void {
    const score = productSeoSourceMaterialScore(input);
    if (shouldSkipSeoForThinSource(score)) {
        throw new ThinSourceSkippedError(score);
    }
}

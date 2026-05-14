import { createHash } from "crypto";

/** Normalizza la domanda per confronto e hash (cache). */
export function normalizeAssistantQuestion(raw: string): string {
    const s = raw
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return s.slice(0, 500);
}

export function assistantQuestionHash(normalized: string): string {
    return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Similarità Jaccard su token (parole); utile per domande quasi identiche. */
export function tokenSetSimilarity(a: string, b: string): number {
    const ta = new Set(a.split(/\s+/).filter((w) => w.length > 1));
    const tb = new Set(b.split(/\s+/).filter((w) => w.length > 1));
    if (ta.size === 0 && tb.size === 0) return 1;
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    ta.forEach((w) => {
        if (tb.has(w)) inter++;
    });
    const union = ta.size + tb.size - inter;
    return union === 0 ? 0 : inter / union;
}

/** @deprecated Usa {@link getAssistantCacheSimilarityThreshold} da `@/lib/ai-cost-config`. */
export const ASSISTANT_SIMILARITY_THRESHOLD = 0.88;

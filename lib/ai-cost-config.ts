/**
 * Configurazione costi / token per chiamate AI.
 *
 * Provider economici (stesso protocollo chat di OpenAI): imposta nel server
 * `OPENAI_BASE_URL` + chiave del fornitore in Impostazioni azienda, es.:
 * - Groq: https://api.groq.com/openai/v1 + modelli llama-3.1-8b-instant, llama-3.3-70b-versatile
 * - Together AI, Mistral, OpenRouter: vedi `lib/openai-compatible-client.ts`
 *
 * Per JSON breve (titolo, traduzione, assistente, arricchimenti) usa opzionalmente un modello
 * più leggero di quello delle schede lunghe: `OPENAI_JSON_CHAT_MODEL`.
 */

export function getOpenAiJsonChatModel(): string {
    const j = (process.env.OPENAI_JSON_CHAT_MODEL || "").trim();
    if (j) return j;
    const c = (process.env.OPENAI_CHAT_MODEL || "").trim();
    if (c) return c;
    return "gpt-4o-mini";
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Max token in uscita per l’assistente piattaforma (default più basso del vecchio 1800). */
export function getAssistantMaxOutputTokens(): number {
    const n = parseInt(process.env.AI_ASSISTANT_MAX_OUTPUT_TOKENS || "", 10);
    return clampInt(n, 280, 3200, 900);
}

/** Max token per traduzione JSON (prima 2500). */
export function getTranslateMaxOutputTokens(): number {
    const n = parseInt(process.env.AI_TRANSLATE_MAX_OUTPUT_TOKENS || "", 10);
    return clampInt(n, 400, 6000, 1400);
}

/** Soglia 0–1 per riuso cache assistente (domande simili); più alta = più cache, meno chiamate. */
export function getAssistantCacheSimilarityThreshold(): number {
    const n = parseFloat(process.env.AI_ASSISTANT_CACHE_SIMILARITY || "");
    if (!Number.isFinite(n)) return 0.88;
    return Math.min(0.98, Math.max(0.75, n));
}

/*
 * SEO / schede prodotto (costi): vedi anche `lib/ai-content-budget.ts` e `lib/ai-seo-source-material.ts`.
 * - AI_SEO_SKIP_THIN_SOURCE — default true: non chiamare il modello se titolo+doc+extra sono troppo scarsi.
 * - AI_SEO_MIN_SOURCE_CHARS — soglia «segnale» (default 32).
 * - AI_SEO_ALLOW_THIN_SOURCE — true = forza comunque la chiamata (equivale a skip disattivato).
 * - OPENAI_PRODUCT_COPY_MAX_TOKENS_FAST / _FULL — tetto max_tokens per completion.
 * - AI_CONTENT_PROVIDER=gemini — spesso più economico del default OpenAI per testi lunghi.
 * - AI_JSON_USER_MAX_CHARS — tetto caratteri per il messaggio `user` nelle completion JSON (default 14000).
 * - AI_TITLE_SERP_MAX_QUERIES / AI_TITLE_WEB_CONTEXT_MAX_CHARS — suggest titolo: meno SerpAPI e prompt web più corto.
 * - AI_SHOPPER_MAX_PAYLOAD_CHARS / AI_SHOPPER_MESSAGE_MAX_CHARS — personal shopper Woo: meno contesto verso il modello.
 */

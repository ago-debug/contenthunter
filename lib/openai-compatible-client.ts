import OpenAI from "openai";

/**
 * Client SDK ufficiale `openai` con endpoint configurabile.
 * Senza `OPENAI_BASE_URL` si usa l’API OpenAI classica.
 *
 * Endpoint compatibili (stesso formato chat completions), da provare per costi più bassi:
 * - Groq: `https://api.groq.com/openai/v1` + modelli tipo `llama-3.1-8b-instant`
 * - Together AI: `https://api.together.xyz/v1`
 * - Mistral: `https://api.mistral.ai/v1`
 * - OpenRouter: `https://openrouter.ai/api/v1` (aggregatore, confronta prezzi per modello)
 * - DeepSeek, SiliconFlow, Fireworks, ecc.: endpoint `/v1` compatibile + chiave del provider
 *
 * In Impostazioni / env la chiave deve essere quella del fornitore scelto (non necessariamente “OpenAI”).
 */
export function createOpenAiCompatibleClient(apiKey: string): OpenAI {
    const baseURL = (process.env.OPENAI_BASE_URL || "").trim();
    return new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
    });
}

/**
 * Solo host `api.openai.com` (es. `images.edit`, modelli immagine).
 * Non usa `OPENAI_BASE_URL`: se usi Groq per il testo, le immagini restano su OpenAI.
 */
export function createOpenAiOfficialClient(apiKey: string): OpenAI {
    return new OpenAI({ apiKey });
}

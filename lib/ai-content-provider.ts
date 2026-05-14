import { createOpenAiCompatibleClient } from "@/lib/openai-compatible-client";
import { getOpenAiJsonChatModel } from "@/lib/ai-cost-config";
import { generateProductCopySingle } from "@/lib/ai-product-copy";
import { generateProductCopySingleGemini, geminiGenerateText, getGeminiJsonContentModel } from "@/lib/gemini-content";

export type ContentAiKeys = { openai: string; gemini: string };

export type ResolvedContentAi =
    | { provider: "gemini"; apiKey: string }
    | { provider: "openai"; apiKey: string };

/**
 * Sceglie il backend per testi catalogo / SEO / traduzioni.
 * - Default: OpenAI se disponibile (stesso comportamento pre–provider unificato).
 * - Gemini-first: `AI_CONTENT_PROVIDER=gemini` (o chiave Gemini senza OpenAI) — spesso conveniente con `gemini-1.5-flash` / `GEMINI_JSON_MODEL`.
 * - JSON breve (titolo, traduzioni, assistente): modello separato via `OPENAI_JSON_CHAT_MODEL` / `GEMINI_JSON_MODEL` (vedi `lib/ai-cost-config.ts`).
 */
export function resolveContentAiProvider(keys: ContentAiKeys): ResolvedContentAi | null {
    const mode = (process.env.AI_CONTENT_PROVIDER || "openai").trim().toLowerCase();
    const wantOpenAi = mode === "openai";

    if (wantOpenAi) {
        if (keys.openai) return { provider: "openai", apiKey: keys.openai };
        if (keys.gemini) return { provider: "gemini", apiKey: keys.gemini };
        return null;
    }
    if (keys.gemini) return { provider: "gemini", apiKey: keys.gemini };
    if (keys.openai) return { provider: "openai", apiKey: keys.openai };
    return null;
}

export const CONTENT_AI_KEY_MISSING_MESSAGE =
    "Chiave AI mancante: configura OpenAI o Gemini in Impostazioni azienda (o OPENAI_API_KEY / GEMINI_API_KEY sul server). Per usare prima Gemini: AI_CONTENT_PROVIDER=gemini.";

export async function runProductCopySingle(
    keys: ContentAiKeys,
    args: { fullPrompt: string; maxTokens: number }
): Promise<string> {
    const p = resolveContentAiProvider(keys);
    if (!p) throw new Error(CONTENT_AI_KEY_MISSING_MESSAGE);
    if (p.provider === "gemini") return generateProductCopySingleGemini(p.apiKey, args);
    const openai = createOpenAiCompatibleClient(p.apiKey);
    return generateProductCopySingle(openai, args);
}

/** Completamento strutturato JSON (traduzioni, titolo prodotto). */
export async function runJsonChatCompletion(
    keys: ContentAiKeys,
    args: { system: string; user: string; maxTokens: number; temperature: number }
): Promise<string> {
    const p = resolveContentAiProvider(keys);
    if (!p) throw new Error(CONTENT_AI_KEY_MISSING_MESSAGE);
    const userMax = (() => {
        const n = parseInt(process.env.AI_JSON_USER_MAX_CHARS || "", 10);
        if (Number.isFinite(n) && n >= 2000 && n <= 100_000) return n;
        return 14_000;
    })();
    const userTrimmed =
        args.user.length > userMax ? `${args.user.slice(0, userMax)}\n…[troncato da ${args.user.length} caratteri]` : args.user;
    if (p.provider === "gemini") {
        return geminiGenerateText({
            apiKey: p.apiKey,
            systemInstruction: args.system,
            user: userTrimmed,
            maxOutputTokens: args.maxTokens,
            temperature: args.temperature,
            responseMimeType: "application/json",
            model: getGeminiJsonContentModel(),
        });
    }
    const openai = createOpenAiCompatibleClient(p.apiKey);
    const completion = await openai.chat.completions.create({
        model: getOpenAiJsonChatModel(),
        messages: [
            { role: "system", content: args.system },
            { role: "user", content: userTrimmed },
        ],
        temperature: args.temperature,
        max_tokens: args.maxTokens,
        response_format: { type: "json_object" },
    });
    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) throw new Error("Risposta AI vuota");
    return raw;
}

import { GoogleGenerativeAI, type RequestOptions } from "@google/generative-ai";
import { normalizeGeminiApiKey, normalizeGeminiBaseUrl } from "@/lib/gemini-api-key";
import { PRODUCT_COPY_SYSTEM } from "@/lib/ai-product-copy";

/** Modello per testi (schede, SEO, traduzioni JSON). Distinto da `GEMINI_MODEL` usato per i PDF. */
export function getGeminiContentModel(): string {
    return (process.env.GEMINI_CONTENT_MODEL || "gemini-1.5-flash").trim() || "gemini-1.5-flash";
}

/**
 * Modello per risposte JSON corte (titolo, traduzione, assistente).
 * Default = stesso di {@link getGeminiContentModel}; per ridurre costi prova es. `gemini-2.0-flash`.
 */
export function getGeminiJsonContentModel(): string {
    const j = (process.env.GEMINI_JSON_MODEL || "").trim();
    if (j) return j;
    return getGeminiContentModel();
}

function geminiContentRequestOptions(): RequestOptions | undefined {
    const baseUrl = normalizeGeminiBaseUrl(process.env.GEMINI_API_BASE_URL);
    const apiVersion = process.env.GEMINI_API_VERSION?.trim();
    if (!baseUrl && !apiVersion) return undefined;
    return {
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiVersion ? { apiVersion } : {}),
    };
}

function getResponseText(result: { response: { text: () => string } }): string {
    try {
        const text = result.response.text();
        return text ?? "";
    } catch (e: any) {
        const msg = e?.message ?? "";
        if (msg.includes("valid `Part`") || msg.includes("safety") || msg.includes("blocked")) {
            throw new Error(
                "Gemini ha bloccato la risposta. Riprova con input diverso o controlla le impostazioni di sicurezza."
            );
        }
        throw e;
    }
}

export async function geminiGenerateText(args: {
    apiKey: string;
    systemInstruction?: string;
    user: string;
    maxOutputTokens: number;
    temperature?: number;
    responseMimeType?: "application/json" | "text/plain";
    /** Se impostato, sostituisce il modello di default (es. flash dedicato al JSON). */
    model?: string;
}): Promise<string> {
    const key = normalizeGeminiApiKey(args.apiKey);
    if (!key) throw new Error("Chiave Gemini mancante");

    const genAI = new GoogleGenerativeAI(key);
    const generationConfig: {
        maxOutputTokens: number;
        temperature: number;
        responseMimeType?: string;
    } = {
        maxOutputTokens: args.maxOutputTokens,
        temperature: args.temperature ?? 0.45,
    };
    if (args.responseMimeType) generationConfig.responseMimeType = args.responseMimeType;

    const modelOpts = {
        model: (args.model && args.model.trim()) || getGeminiContentModel(),
        generationConfig,
        ...(args.systemInstruction ? { systemInstruction: args.systemInstruction } : {}),
    };
    const opts = geminiContentRequestOptions();
    const model = opts ? genAI.getGenerativeModel(modelOpts, opts) : genAI.getGenerativeModel(modelOpts);

    const result = await model.generateContent(args.user);
    const text = getResponseText(result).trim();
    if (!text) throw new Error("Risposta AI vuota");
    return text;
}

export async function generateProductCopySingleGemini(
    apiKey: string,
    args: { fullPrompt: string; maxTokens: number }
): Promise<string> {
    return geminiGenerateText({
        apiKey,
        systemInstruction: PRODUCT_COPY_SYSTEM,
        user: args.fullPrompt,
        maxOutputTokens: args.maxTokens,
        temperature: 0.45,
    });
}

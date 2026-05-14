import OpenAI from "openai";

/**
 * Modello per descrizioni / SEO prodotto quando si usa il provider OpenAI-compatibile.
 * Default: `gpt-4o-mini`. Con Groq + `OPENAI_BASE_URL=https://api.groq.com/openai/v1` es.: `llama-3.1-8b-instant`.
 * Il provider predefinito per i testi è Gemini (`GEMINI_CONTENT_MODEL`, es. `gemini-1.5-flash`); vedi `lib/ai-content-provider.ts`.
 */
export function getOpenAiChatModelForProductCopy(): string {
    return (process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

/** System prompt condiviso tra OpenAI e Gemini per schede prodotto / SEO. */
export const PRODUCT_COPY_SYSTEM =
    "Sei un generatore ultrarapido di schede prodotto professionali. Rispondi SOLO con il contenuto finale, niente introduzioni.";

export async function generateProductCopySingle(
    openai: InstanceType<typeof OpenAI>,
    args: { fullPrompt: string; maxTokens: number }
): Promise<string> {
    const completion = await openai.chat.completions.create({
        model: getOpenAiChatModelForProductCopy(),
        messages: [
            { role: "system", content: PRODUCT_COPY_SYSTEM },
            { role: "user", content: args.fullPrompt },
        ],
        temperature: 0.45,
        max_tokens: args.maxTokens,
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
        throw new Error("Risposta AI vuota");
    }
    return text;
}

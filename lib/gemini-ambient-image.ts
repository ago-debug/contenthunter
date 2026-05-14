import { normalizeGeminiBaseUrl } from "@/lib/gemini-api-key";

/** Modello Gemini Image (Nano Banana / Nano Banana 2). Sovrascrivibile con GEMINI_IMAGE_MODEL. */
export function resolveGeminiImageModel(): string {
    const fromEnv = process.env.GEMINI_IMAGE_MODEL?.trim();
    if (fromEnv) return fromEnv;
    return "gemini-2.5-flash-image";
}

function geminiGenerateContentUrl(model: string, apiKey: string): string {
    const base =
        normalizeGeminiBaseUrl(process.env.GEMINI_API_BASE_URL) ||
        "https://generativelanguage.googleapis.com";
    const root = base.replace(/\/+$/, "");
    return `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

type GeminiGenResp = {
    candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<Record<string, unknown>> };
    }>;
    error?: { message?: string; code?: number };
};

function extractFirstImageBuffer(resp: GeminiGenResp): { mime: string; data: Buffer } | null {
    const candidates = resp?.candidates;
    if (!candidates?.length) return null;
    for (const c of candidates) {
        const parts = c?.content?.parts;
        if (!parts) continue;
        for (const p of parts) {
            const inline = (p.inlineData || p["inline_data"]) as
                | { data?: string; mimeType?: string; mime_type?: string }
                | undefined;
            if (inline?.data) {
                const mime =
                    inline.mimeType ||
                    inline.mime_type ||
                    "image/png";
                try {
                    return { mime, data: Buffer.from(inline.data, "base64") };
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

/**
 * Trasforma la foto prodotto in una singola immagine lifestyle usando Gemini Image (Nano Banana).
 */
export async function generateAmbientProductImageNanoBanana(opts: {
    apiKey: string;
    model?: string;
    imageBase64: string;
    mimeType: string;
    editPrompt: string;
}): Promise<{ mime: string; data: Buffer }> {
    const model = opts.model || resolveGeminiImageModel();
    const url = geminiGenerateContentUrl(model, opts.apiKey);

    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        inlineData: {
                            mimeType: opts.mimeType,
                            data: opts.imageBase64,
                        },
                    },
                    { text: opts.editPrompt },
                ],
            },
        ],
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: "1:1",
            },
        },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const json = (await res.json()) as GeminiGenResp;
    if (!res.ok) {
        const msg =
            json?.error?.message ||
            (typeof json === "object" && json !== null && "message" in json
                ? String((json as { message?: string }).message)
                : "") ||
            `Gemini HTTP ${res.status}`;
        throw new Error(msg);
    }

    const extracted = extractFirstImageBuffer(json);
    if (!extracted) {
        const block = json?.candidates?.[0]?.finishReason;
        throw new Error(
            block
                ? `Generazione immagine Gemini non riuscita (finish: ${block}).`
                : "Generazione immagine Gemini: nessun dato immagine nella risposta."
        );
    }
    return extracted;
}

import OpenAI from "openai";

/**
 * Modello OpenAI per descrizioni / SEO prodotto (chat completions).
 * Imposta sul server: `OPENAI_CHAT_MODEL=gpt-4o-mini` (default, veloce ed economico).
 * Esempi: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo` (più vecchio, spesso più economico).
 */
export function getOpenAiChatModelForProductCopy(): string {
    return (process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

const SYSTEM =
    "Sei un generatore ultrarapido di schede prodotto professionali. Rispondi SOLO con il contenuto finale, niente introduzioni.";

/**
 * Due completamenti OpenAI in parallelo: meno tempo a muro rispetto a un'unica risposta
 * che genera in sequenza breve → lunga → bullet → campi tecnici.
 */
export async function generateProductCopyMerged(
    openai: InstanceType<typeof OpenAI>,
    args: {
        basePrompt: string;
        /** Se true include ---TECHNICAL_FIELDS--- nel secondo blocco (flusso ERP singolo). */
        includeTechnicalFields: boolean;
    }
): Promise<string> {
    const { basePrompt, includeTechnicalFields } = args;

    const part1User = `${basePrompt}

Genera ESCLUSIVAMENTE questo blocco (prima riga esattamente il marker):
---SHORT_DESCRIPTION---
[2-3 frasi, tono tecnico B2B neutro, niente marketing]

Non aggiungere altri marker o testo oltre quanto richiesto.`;

    const part2User = includeTechnicalFields
        ? `${basePrompt}

Genera ESCLUSIVAMENTE questi blocchi in ordine (prima riga di ogni sezione = marker):
---DESCRIPTION---
[1-3 paragrafi]
---BULLET_POINTS---
[5-8 punti, uno per riga]
---TECHNICAL_FIELDS---
Colore: [valore o vuoto]
Materiale: [valore o vuoto]
Dimensioni: [valore o vuoto]
Peso: [valore o vuoto]`
        : `${basePrompt}

Genera ESCLUSIVAMENTE questi blocchi in ordine (prima riga di ogni sezione = marker):
---DESCRIPTION---
[1-3 paragrafi]
---BULLET_POINTS---
[5-8 punti, uno per riga]`;

    const model = getOpenAiChatModelForProductCopy();
    const [r1, r2] = await Promise.all([
        openai.chat.completions.create({
            model,
            messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: part1User },
            ],
            temperature: 0.45,
            max_tokens: 150,
        }),
        openai.chat.completions.create({
            model,
            messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: part2User },
            ],
            temperature: 0.45,
            max_tokens: includeTechnicalFields ? 420 : 320,
        }),
    ]);

    const t1 = r1.choices[0]?.message?.content?.trim() || "";
    const t2 = r2.choices[0]?.message?.content?.trim() || "";
    if (!t1 && !t2) {
        throw new Error("Risposta AI vuota");
    }
    return `${t1}\n\n${t2}`;
}

/** Fallback: una sola chiamata (stesso formato di prima), se il parallelo fallisce. */
export async function generateProductCopySingle(
    openai: InstanceType<typeof OpenAI>,
    args: { fullPrompt: string; maxTokens: number }
): Promise<string> {
    const completion = await openai.chat.completions.create({
        model: getOpenAiChatModelForProductCopy(),
        messages: [
            { role: "system", content: SYSTEM },
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

/**
 * Stesso contenuto di {@link generateProductCopySingle}, ma in streaming (token in tempo reale verso il client).
 */
export async function streamProductCopySingle(
    openai: InstanceType<typeof OpenAI>,
    args: { fullPrompt: string; maxTokens: number }
): Promise<ReadableStream<Uint8Array>> {
    const stream = await openai.chat.completions.create({
        model: getOpenAiChatModelForProductCopy(),
        messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: args.fullPrompt },
        ],
        temperature: 0.45,
        max_tokens: args.maxTokens,
        stream: true,
    });

    const encoder = new TextEncoder();
    return new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content ?? "";
                    if (content) controller.enqueue(encoder.encode(content));
                }
                controller.close();
            } catch (e) {
                controller.error(e);
            }
        },
    });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { CONTENT_AI_KEY_MISSING_MESSAGE, runJsonChatCompletion } from "@/lib/ai-content-provider";
import { PLATFORM_ASSISTANT_KNOWLEDGE_IT } from "@/lib/platform-assistant-knowledge";
import { getAssistantCacheSimilarityThreshold, getAssistantMaxOutputTokens } from "@/lib/ai-cost-config";
import { assistantQuestionHash, normalizeAssistantQuestion, tokenSetSimilarity } from "@/lib/assistant-question-utils";

export const runtime = "nodejs";
export const maxDuration = 120;

type GuidedResponse = {
    answer: string;
    guidedSteps: string[];
};

function parseGuidedJson(raw: string): GuidedResponse {
    let t = raw.trim();
    if (t.startsWith("```")) {
        t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    }
    try {
        const o = JSON.parse(t) as { answer?: string; guidedSteps?: unknown };
        const answer = String(o.answer ?? "").trim();
        const steps = Array.isArray(o.guidedSteps)
            ? (o.guidedSteps as unknown[]).map((s) => String(s).trim()).filter(Boolean)
            : [];
        return { answer, guidedSteps: steps };
    } catch {
        return { answer: t.trim(), guidedSteps: [] };
    }
}

export async function POST(req: Request) {
    try {
        const ctx = await requireCompanyId(req);
        if (!ctx) {
            return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
        }
        const { companyId } = ctx;

        let body: { message?: string };
        try {
            body = (await req.json()) as { message?: string };
        } catch {
            return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
        }

        const message = String(body.message ?? "").trim();
        if (!message) {
            return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
        }
        if (message.length > 8000) {
            return NextResponse.json({ error: "Messaggio troppo lungo (max 8000 caratteri)" }, { status: 400 });
        }

        const normalized = normalizeAssistantQuestion(message);
        if (!normalized) {
            return NextResponse.json({ error: "Messaggio non valido dopo normalizzazione" }, { status: 400 });
        }

        const qHash = assistantQuestionHash(normalized);

        const exact = await prisma.assistantQaCache.findUnique({
            where: { companyId_questionHash: { companyId, questionHash: qHash } },
        });
        if (exact) {
            await prisma.assistantQaCache.update({
                where: { id: exact.id },
                data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
            });
            const steps = Array.isArray(exact.guidedSteps)
                ? (exact.guidedSteps as string[]).filter((s) => typeof s === "string")
                : [];
            return NextResponse.json({
                answer: exact.answerMarkdown,
                guidedSteps: steps,
                fromCache: true,
                cacheKind: "exact" as const,
            });
        }

        const candidates = await prisma.assistantQaCache.findMany({
            where: { companyId },
            orderBy: [{ hitCount: "desc" }, { lastHitAt: "desc" }],
            take: 72,
            select: {
                id: true,
                questionNormalized: true,
                answerMarkdown: true,
                guidedSteps: true,
            },
        });

        const simThreshold = getAssistantCacheSimilarityThreshold();
        for (const row of candidates) {
            const sim = tokenSetSimilarity(normalized, row.questionNormalized);
            if (sim >= simThreshold) {
                await prisma.assistantQaCache.update({
                    where: { id: row.id },
                    data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
                });
                const steps = Array.isArray(row.guidedSteps)
                    ? (row.guidedSteps as string[]).filter((s) => typeof s === "string")
                    : [];
                return NextResponse.json({
                    answer: row.answerMarkdown,
                    guidedSteps: steps,
                    fromCache: true,
                    cacheKind: "similar" as const,
                });
            }
        }

        const keys = await resolveIntegrationKeys(companyId);
        if (!keys.gemini && !keys.openai) {
            return NextResponse.json(
                { error: "Chiave AI mancante.", details: CONTENT_AI_KEY_MISSING_MESSAGE },
                { status: 500 }
            );
        }

        const system = `Sei l'assistente della piattaforma Iris (catalogo prodotti B2B, cataloghi PDF, integrazioni WooCommerce/PrestaShop).
Usa ESCLUSIVAMENTE la mappa funzionale sotto per spiegare dove clicare e cosa fare. Se la domanda non è coperta dalla mappa, dillo chiaramente e suggerisci solo verifiche generiche (Impostazioni, supporto IT), senza inventare funzioni inesistenti.

MAPPA PIATTAFORMA:
${PLATFORM_ASSISTANT_KNOWLEDGE_IT}

FORMATO RISPOSTA: solo JSON valido con chiavi:
- "answer": stringa markdown breve (titoli con ##, elenchi puntati dove serve).
- "guidedSteps": array di stringhe, passi numerabili dall'utente (es. "Apri Biblioteca prodotti dal menu a sinistra", "Clicca Esegui Salvataggio in fondo alla scheda").`;

        const user = `Domanda utente:\n${message}\n\nSe utile, includi in guidedSteps un percorso ordinato (3–8 passi).`;

        const raw = await runJsonChatCompletion(
            { openai: keys.openai, gemini: keys.gemini },
            {
                system,
                user,
                maxTokens: getAssistantMaxOutputTokens(),
                temperature: 0.35,
            }
        );

        const { answer, guidedSteps } = parseGuidedJson(raw);
        if (!answer) {
            return NextResponse.json({ error: "Risposta AI vuota o non valida" }, { status: 502 });
        }

        await prisma.assistantQaCache.upsert({
            where: { companyId_questionHash: { companyId, questionHash: qHash } },
            create: {
                companyId,
                questionHash: qHash,
                questionNormalized: normalized.slice(0, 512),
                questionPreview: message.slice(0, 200),
                answerMarkdown: answer,
                guidedSteps: guidedSteps as object,
                hitCount: 1,
                lastHitAt: new Date(),
            },
            update: {
                answerMarkdown: answer,
                guidedSteps: guidedSteps as object,
                questionPreview: message.slice(0, 200),
                lastHitAt: new Date(),
            },
        });

        return NextResponse.json({
            answer,
            guidedSteps,
            fromCache: false,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Errore assistente";
        console.error("platform-assistant:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

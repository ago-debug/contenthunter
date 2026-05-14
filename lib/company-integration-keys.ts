import { prisma } from "@/lib/prisma";
import { normalizeGeminiApiKey } from "@/lib/gemini-api-key";

export type ResolvedIntegrationKeys = {
    openai: string;
    serpapi: string;
    gemini: string;
};

/**
 * Risolve OpenAI / SerpAPI / Gemini per company: valori su DB se presenti, altrimenti env server.
 */
export async function resolveIntegrationKeys(companyId: number): Promise<ResolvedIntegrationKeys> {
    const row = await prisma.company.findUnique({
        where: { id: companyId },
        select: { openaiApiKey: true, serpapiKey: true, geminiApiKey: true },
    });
    const geminiRaw = (row?.geminiApiKey || process.env.GEMINI_API_KEY || "").trim();
    return {
        openai: (row?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim(),
        serpapi: (row?.serpapiKey || process.env.SERPAPI_KEY || process.env.SERPAPI || "").trim(),
        gemini: normalizeGeminiApiKey(geminiRaw),
    };
}

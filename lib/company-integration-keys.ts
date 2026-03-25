import { prisma } from "@/lib/prisma";

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
    return {
        openai: (row?.openaiApiKey || process.env.OPENAI_API_KEY || "").trim(),
        serpapi: (row?.serpapiKey || process.env.SERPAPI_KEY || process.env.SERPAPI || "").trim(),
        gemini: (row?.geminiApiKey || process.env.GEMINI_API_KEY || "").trim(),
    };
}

import { prisma } from "@/lib/prisma";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { createOpenAiCompatibleClient } from "@/lib/openai-compatible-client";
import { generateProductCopyMerged, generateProductCopySingle } from "@/lib/ai-product-copy";
import {
    AI_PRODUCT_COPY_FAST,
    AI_PRODUCT_COPY_FULL,
    maxOutputTokensProductCopy,
} from "@/lib/ai-content-budget";

const KEYS_CACHE_TTL_MS = 2 * 60 * 1000;
const keysCache = new Map<number, { openai: string; updatedAt: number }>();
const brandGuidelinesCache = new Map<string, string>();

export async function generateSeoBlocksForProduct(args: {
  companyId: number;
  product: any;
  fastMode?: boolean;
  targetFields?: Array<"short" | "description" | "bullets">;
}): Promise<{ short: string; desc: string; bullets: string }> {
  const { companyId, product, fastMode = true, targetFields } = args;
  const requested = targetFields && targetFields.length > 0 ? targetFields : ["short", "description", "bullets"];
  const needShort = requested.includes("short");
  const needDesc = requested.includes("description");
  const needBullets = requested.includes("bullets");
  const now = Date.now();
  const cached = keysCache.get(companyId);
  let openaiKey = "";
  const cacheValid = !!cached && now - cached.updatedAt < KEYS_CACHE_TTL_MS && !!cached.openai;
  if (cacheValid) {
    openaiKey = cached.openai;
  } else {
    const keys = await resolveIntegrationKeys(companyId);
    openaiKey = (keys.openai || "").trim();
    // Non tenere in cache valori vuoti: quando l'utente salva la chiave da UI
    // deve diventare efficace subito senza dover riavviare il server.
    if (openaiKey) {
      keysCache.set(companyId, { openai: openaiKey, updatedAt: now });
    } else {
      keysCache.delete(companyId);
    }
  }
  if (!openaiKey) {
    throw new Error("Chiave OpenAI mancante per l'azienda.");
  }

  const brandName = String(product?.brand || "").trim();
  const brandId = product?.brandId != null ? Number(product.brandId) : null;
  let brandGuidelines = "";
  if (brandName || brandId) {
    const brandCacheKey = `${companyId}:${brandId ?? brandName.toLowerCase()}`;
    const cached = brandGuidelinesCache.get(brandCacheKey);
    if (cached !== undefined) {
      brandGuidelines = cached;
    } else {
      const b = await prisma.brand.findFirst({
        where: brandId ? { id: brandId, companyId } : { name: brandName, companyId },
        select: { name: true, aiContentGuidelines: true },
      });
      const bgMax = fastMode
        ? AI_PRODUCT_COPY_FAST.brandGuidelinesMaxChars
        : AI_PRODUCT_COPY_FULL.brandGuidelinesMaxChars;
      const computed = b?.aiContentGuidelines
        ? `\nLINEA GUIDA BRAND "${b.name}":\n${String(b.aiContentGuidelines).slice(0, bgMax)}\n`
        : "";
      brandGuidelinesCache.set(brandCacheKey, computed);
      brandGuidelines = computed;
    }
  }

  const docLim = fastMode
    ? AI_PRODUCT_COPY_FAST.docDescriptionMaxChars
    : AI_PRODUCT_COPY_FULL.docDescriptionMaxChars;
  const extraLim = fastMode
    ? AI_PRODUCT_COPY_FAST.extraFieldsMaxChars
    : AI_PRODUCT_COPY_FULL.extraFieldsMaxChars;
  const extra = product?.extraFields || {};
  const extraFieldsPreview =
    extra && typeof extra === "object"
      ? Object.entries(extra)
          .map(([k, v]) => `${k}: ${String(v ?? "")}`)
          .join(", ")
          .slice(0, extraLim)
      : "";

  const docDescription = String(product?.docDescription || "").slice(0, docLim);

  const basePrompt = `
Sei un redattore tecnico B2B. Genera contenuti SEO in italiano per scheda prodotto.
${brandGuidelines}
Non inventare dati, niente tono commerciale aggressivo.
${fastMode ? "MODALITA FAST: massimizza sintesi e velocita, mantenendo accuratezza." : ""}

DATI:
- SKU: ${product?.sku || ""}
- EAN: ${product?.ean || ""}
- Titolo: ${product?.title || product?.translations?.it?.title || ""}
- Brand: ${brandName}
- Categoria: ${product?.category || ""}
- Descrizione tecnica: ${docDescription}
- Campi extra: ${extraFieldsPreview}
`.trim();

  const sections: string[] = [];
  if (needShort) sections.push("---SHORT_DESCRIPTION---\n[2-3 frasi]");
  if (needDesc) sections.push(`---DESCRIPTION---\n[${fastMode ? "1 paragrafo breve" : "1-3 paragrafi"}]`);
  if (needBullets) sections.push(`---BULLET_POINTS---\n[${fastMode ? "4-6" : "5-8"} punti, una riga per punto]`);
  const fullPromptFallback = `${basePrompt}

RISPONDI SOLO in questo formato:
${sections.join("\n")}
`;

  const openai = createOpenAiCompatibleClient(openaiKey);
  let txt: string;
  const requestedCount = [needShort, needDesc, needBullets].filter(Boolean).length || 1;
  if (fastMode) {
    // Fast mode: una sola chiamata, meno token => costo inferiore e latenza minore.
    txt = await generateProductCopySingle(openai, {
      fullPrompt: fullPromptFallback.trim(),
      maxTokens: maxOutputTokensProductCopy(requestedCount, true),
    });
  } else {
    try {
      if (needShort && needDesc && needBullets) {
        txt = await generateProductCopyMerged(openai, {
          basePrompt,
          includeTechnicalFields: false,
        });
      } else {
        txt = await generateProductCopySingle(openai, {
          fullPrompt: fullPromptFallback.trim(),
          maxTokens: maxOutputTokensProductCopy(requestedCount, false),
        });
      }
    } catch (e) {
      console.warn("seo-ai parallel fallback:", e);
      txt = await generateProductCopySingle(openai, {
        fullPrompt: fullPromptFallback.trim(),
        maxTokens: maxOutputTokensProductCopy(requestedCount, false),
      });
    }
  }
  const shortMatch = txt.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
  const descMatch = txt.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
  const bulletMatch = txt.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
  return {
    short: shortMatch ? shortMatch[1].trim() : "",
    desc: descMatch ? descMatch[1].trim() : "",
    bullets: bulletMatch ? bulletMatch[1].trim() : "",
  };
}


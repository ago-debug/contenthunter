import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";
import { generateProductCopyMerged, generateProductCopySingle } from "@/lib/ai-product-copy";

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
  const keys = await resolveIntegrationKeys(companyId);
  if (!keys.openai) {
    throw new Error("Chiave OpenAI mancante per l'azienda.");
  }

  const brandName = String(product?.brand || "").trim();
  const brandId = product?.brandId != null ? Number(product.brandId) : null;
  let brandGuidelines = "";
  if (brandName || brandId) {
    const b = await prisma.brand.findFirst({
      where: brandId ? { id: brandId, companyId } : { name: brandName, companyId },
      select: { name: true, aiContentGuidelines: true },
    });
    if (b?.aiContentGuidelines) {
      brandGuidelines = `\nLINEA GUIDA BRAND "${b.name}":\n${b.aiContentGuidelines}\n`;
    }
  }

  const extra = product?.extraFields || {};
  const extraFieldsPreview =
    extra && typeof extra === "object"
      ? Object.entries(extra)
          .map(([k, v]) => `${k}: ${String(v ?? "")}`)
          .join(", ")
          .slice(0, fastMode ? 450 : 1200)
      : "";

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
- Descrizione tecnica: ${product?.docDescription || ""}
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

  const openai = new OpenAI({ apiKey: keys.openai });
  let txt: string;
  const requestedCount = [needShort, needDesc, needBullets].filter(Boolean).length || 1;
  if (fastMode) {
    // Fast mode: una sola chiamata, meno token => costo inferiore e latenza minore.
    txt = await generateProductCopySingle(openai, {
      fullPrompt: fullPromptFallback.trim(),
      maxTokens: Math.min(380, Math.max(120, 120 * requestedCount)),
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
          maxTokens: Math.min(520, Math.max(170, 170 * requestedCount)),
        });
      }
    } catch (e) {
      console.warn("seo-ai parallel fallback:", e);
      txt = await generateProductCopySingle(openai, {
        fullPrompt: fullPromptFallback.trim(),
        maxTokens: Math.min(520, Math.max(170, 170 * requestedCount)),
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


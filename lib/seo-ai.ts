import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveIntegrationKeys } from "@/lib/company-integration-keys";

export async function generateSeoBlocksForProduct(args: {
  companyId: number;
  product: any;
}): Promise<{ short: string; desc: string; bullets: string }> {
  const { companyId, product } = args;
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
          .slice(0, 1200)
      : "";

  const prompt = `
Sei un redattore tecnico B2B. Genera contenuti SEO in italiano per scheda prodotto.
${brandGuidelines}
Non inventare dati, niente tono commerciale aggressivo.

DATI:
- SKU: ${product?.sku || ""}
- EAN: ${product?.ean || ""}
- Titolo: ${product?.title || product?.translations?.it?.title || ""}
- Brand: ${brandName}
- Categoria: ${product?.category || ""}
- Descrizione tecnica: ${product?.docDescription || ""}
- Campi extra: ${extraFieldsPreview}

RISPONDI SOLO in questo formato:
---SHORT_DESCRIPTION---
[2-3 frasi]
---DESCRIPTION---
[1-3 paragrafi]
---BULLET_POINTS---
[5-8 punti, una riga per punto]
`.trim();

  const openai = new OpenAI({ apiKey: keys.openai });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Sei un generatore di schede tecniche SEO. Rispondi solo con i blocchi richiesti.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 900,
  });

  const txt = completion.choices?.[0]?.message?.content || "";
  const shortMatch = txt.match(/---SHORT_DESCRIPTION---([\s\S]*?)(---|$)/);
  const descMatch = txt.match(/---DESCRIPTION---([\s\S]*?)(---|$)/);
  const bulletMatch = txt.match(/---BULLET_POINTS---([\s\S]*?)(---|$)/);
  return {
    short: shortMatch ? shortMatch[1].trim() : "",
    desc: descMatch ? descMatch[1].trim() : "",
    bullets: bulletMatch ? bulletMatch[1].trim() : "",
  };
}


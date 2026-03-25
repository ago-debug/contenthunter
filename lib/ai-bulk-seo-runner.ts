import { prisma } from "@/lib/prisma";
import { generateSeoBlocksForProduct } from "@/lib/seo-ai";

const activeJobs = new Set<number>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function triggerAiBulkSeoJob(jobId: number): Promise<void> {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  try {
    await runAiBulkSeoJob(jobId);
  } finally {
    activeJobs.delete(jobId);
  }
}

async function runAiBulkSeoJob(jobId: number): Promise<void> {
  while (true) {
    const job = await prisma.aiBulkSeoJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        companyId: true,
        status: true,
        overwriteExisting: true,
        total: true,
        done: true,
        errors: true,
        brand: true,
        catalogue: true,
      },
    });
    if (!job) return;
    if (job.status === "paused") {
      await sleep(800);
      continue;
    }
    if (job.status === "stopped" || job.status === "completed" || job.status === "failed") {
      return;
    }

    const nextItem = await prisma.aiBulkSeoJobItem.findFirst({
      where: { jobId, status: "pending" },
      orderBy: { id: "asc" },
      select: { id: true, productId: true },
    });

    if (!nextItem) {
      await prisma.aiBulkSeoJob.update({
        where: { id: jobId },
        data: { status: "completed", finishedAt: new Date() },
      });
      await prisma.activityLog.create({
        data: {
          companyId: job.companyId,
          type: "ai_bulk_seo",
          status: "completed",
          description: "Generazione SEO AI massiva completata",
          brand: job.brand || null,
          catalogue: job.catalogue || null,
          total: job.total,
          done: job.done,
          errors: job.errors,
        },
      });
      return;
    }

    await prisma.aiBulkSeoJobItem.update({
      where: { id: nextItem.id },
      data: { status: "processing", attempts: { increment: 1 } },
    });

    try {
      const product = await prisma.product.findFirst({
        where: { id: nextItem.productId, companyId: job.companyId },
        include: {
          texts: true,
          extraFields: true,
        },
      });
      if (!product) {
        throw new Error("Prodotto non trovato o non autorizzato.");
      }

      const extrasObj: Record<string, string> = {};
      for (const ex of product.extraFields) extrasObj[ex.key] = ex.value;
      const transIt = product.texts.find((t) => t.language === "it") || null;
      const productForAi = {
        id: product.id,
        sku: product.sku,
        ean: product.ean,
        brand: product.brand,
        brandId: product.brandId,
        category: product.category,
        title: transIt?.title || "",
        docDescription: transIt?.docDescription || "",
        extraFields: extrasObj,
        translations: { it: transIt },
      };

      const blocks = await generateSeoBlocksForProduct({
        companyId: job.companyId,
        product: productForAi,
      });

      const existing = transIt || {
        title: null,
        description: null,
        bulletPoints: null,
        seoAiText: null,
        docDescription: null,
      };
      const nextSeo = job.overwriteExisting || !existing.seoAiText ? blocks.short || existing.seoAiText : existing.seoAiText;
      const nextDesc = job.overwriteExisting || !existing.description ? blocks.desc || existing.description : existing.description;
      const nextBullets = job.overwriteExisting || !existing.bulletPoints ? blocks.bullets || existing.bulletPoints : existing.bulletPoints;

      await prisma.productText.upsert({
        where: { productId_language: { productId: product.id, language: "it" } },
        create: {
          productId: product.id,
          language: "it",
          title: existing.title,
          description: nextDesc,
          bulletPoints: nextBullets,
          seoAiText: nextSeo,
          docDescription: existing.docDescription,
        },
        update: {
          description: nextDesc,
          bulletPoints: nextBullets,
          seoAiText: nextSeo,
        },
      });

      await prisma.aiBulkSeoJobItem.update({
        where: { id: nextItem.id },
        data: { status: "success", message: null, processedAt: new Date() },
      });
      await prisma.aiBulkSeoJob.update({
        where: { id: jobId },
        data: { done: { increment: 1 } },
      });
    } catch (e: any) {
      const msg = String(e?.message || "Errore sconosciuto").slice(0, 2000);
      await prisma.aiBulkSeoJobItem.update({
        where: { id: nextItem.id },
        data: { status: "error", message: msg, processedAt: new Date() },
      });
      await prisma.aiBulkSeoJob.update({
        where: { id: jobId },
        data: { done: { increment: 1 }, errors: { increment: 1 } },
      });
    }

    await sleep(180);
  }
}


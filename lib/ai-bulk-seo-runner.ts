import { prisma } from "@/lib/prisma";
import { generateSeoBlocksForProduct } from "@/lib/seo-ai";

const activeJobs = new Set<number>();
const jobFastMode = new Map<number, boolean>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function triggerAiBulkSeoJob(
  jobId: number,
  opts?: { fastMode?: boolean }
): Promise<void> {
  if (typeof opts?.fastMode === "boolean") {
    jobFastMode.set(jobId, opts.fastMode);
  }
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  try {
    await runAiBulkSeoJob(jobId);
  } finally {
    activeJobs.delete(jobId);
    if (!activeJobs.has(jobId)) {
      jobFastMode.delete(jobId);
    }
  }
}

async function runAiBulkSeoJob(jobId: number): Promise<void> {
  const markCompletedIfDone = async (job: {
    id: number;
    companyId: number;
    total: number;
    done: number;
    errors: number;
    brand: string | null;
    catalogue: string | null;
  }) => {
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
  };

  const processItem = async (
    item: { id: number; productId: number },
    job: {
      id: number;
      companyId: number;
      overwriteExisting: boolean;
    },
    fastMode: boolean
  ) => {
    try {
      const product = await prisma.product.findFirst({
        where: { id: item.productId, companyId: job.companyId },
        include: {
          texts: true,
          extraFields: true,
        },
      });
      if (!product) {
        throw new Error("Prodotto non trovato o non autorizzato.");
      }

      const transIt = product.texts.find((t) => t.language === "it") || null;
      const existing = transIt || {
        title: null,
        description: null,
        bulletPoints: null,
        seoAiText: null,
        docDescription: null,
      };

      // Risparmio costo: se non sovrascriviamo e tutti i campi sono già pieni, salta senza chiamare AI.
      if (
        !job.overwriteExisting &&
        !!existing.seoAiText &&
        !!existing.description &&
        !!existing.bulletPoints
      ) {
        await prisma.aiBulkSeoJobItem.update({
          where: { id: item.id },
          data: { status: "skipped", message: "Saltato: campi già presenti", processedAt: new Date() },
        });
        await prisma.aiBulkSeoJob.update({
          where: { id: jobId },
          data: { done: { increment: 1 } },
        });
        return;
      }

      const extrasObj: Record<string, string> = {};
      for (const ex of product.extraFields) extrasObj[ex.key] = ex.value;
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
        fastMode,
      });

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
        where: { id: item.id },
        data: { status: "success", message: null, processedAt: new Date() },
      });
      await prisma.aiBulkSeoJob.update({
        where: { id: jobId },
        data: { done: { increment: 1 } },
      });
    } catch (e: any) {
      const msg = String(e?.message || "Errore sconosciuto").slice(0, 2000);
      await prisma.aiBulkSeoJobItem.update({
        where: { id: item.id },
        data: { status: "error", message: msg, processedAt: new Date() },
      });
      await prisma.aiBulkSeoJob.update({
        where: { id: jobId },
        data: { done: { increment: 1 }, errors: { increment: 1 } },
      });
    }
  };

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

    const fastMode = jobFastMode.get(jobId) ?? true;
    const batchSize = fastMode ? 2 : 1;

    const nextItems = await prisma.aiBulkSeoJobItem.findMany({
      where: { jobId, status: "pending" },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, productId: true },
    });

    if (nextItems.length === 0) {
      if (job.done >= job.total) {
        await markCompletedIfDone(job);
        return;
      }
      await sleep(250);
      continue;
    }

    await prisma.aiBulkSeoJobItem.updateMany({
      where: { id: { in: nextItems.map((i) => i.id) }, status: "pending" },
      data: { status: "processing", attempts: { increment: 1 } },
    });

    await Promise.allSettled(nextItems.map((it) => processItem(it, job, fastMode)));

    // Fast mode: mira a ~1 prodotto/secondo medio senza rallentare troppo il loop.
    await sleep(fastMode ? 120 : 180);
  }
}


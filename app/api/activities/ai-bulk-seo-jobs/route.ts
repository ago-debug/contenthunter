import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyId } from "@/lib/auth-api";
import { productHasCompleteSeoBlocks, triggerAiBulkSeoJob } from "@/lib/ai-bulk-seo-runner";

type CreateBody = {
  productIds: number[];
  overwriteExisting?: boolean;
  fastMode?: boolean;
  brand?: string;
  catalogue?: string;
};

export async function POST(req: NextRequest) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { companyId } = ctx;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const ids = Array.isArray(body.productIds)
    ? Array.from(new Set(body.productIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "productIds deve essere un array non vuoto" }, { status: 400 });
  }

  const running = await prisma.aiBulkSeoJob.findFirst({
    where: { companyId, status: { in: ["running", "paused"] } },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json({ error: "Esiste già un job AI in esecuzione", jobId: running.id }, { status: 409 });
  }

  const products = await prisma.product.findMany({
    where: { companyId, id: { in: ids } },
    include: { texts: { where: { language: "it" }, take: 1 } },
  });
  if (products.length === 0) {
    return NextResponse.json({ error: "Nessun prodotto valido selezionato." }, { status: 400 });
  }

  const overwrite = !!body.overwriteExisting;
  const itemCreates = products.map((p) => {
    const t = p.texts[0];
    const preSkipped = !overwrite && productHasCompleteSeoBlocks(t);
    return {
      productId: p.id,
      sku: p.sku,
      title: t?.title || null,
      status: preSkipped ? "skipped" : "pending",
      message: preSkipped ? "Saltato: campi già presenti" : null,
      processedAt: preSkipped ? new Date() : null,
    };
  });
  const skippedUpfront = itemCreates.filter((i) => i.status === "skipped").length;

  const job = await prisma.aiBulkSeoJob.create({
    data: {
      companyId,
      status: "running",
      overwriteExisting: overwrite,
      total: products.length,
      done: skippedUpfront,
      errors: 0,
      brand: body.brand?.trim() || null,
      catalogue: body.catalogue?.trim() || null,
      items: {
        create: itemCreates,
      },
    },
    select: { id: true, total: true },
  });

  void triggerAiBulkSeoJob(job.id, { fastMode: !!body.fastMode });
  return NextResponse.json({ jobId: job.id, total: job.total });
}

export async function GET(req: NextRequest) {
  const ctx = await requireCompanyId(req);
  if (!ctx) {
    return NextResponse.json({ error: "Non autorizzato o azienda non specificata" }, { status: 403 });
  }
  const { companyId } = ctx;

  const job = await prisma.aiBulkSeoJob.findFirst({
    where: { companyId, status: { in: ["running", "paused"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      overwriteExisting: true,
      total: true,
      done: true,
      errors: true,
      brand: true,
      catalogue: true,
      startedAt: true,
      items: {
        where: { status: "processing" },
        orderBy: { id: "asc" },
        take: 1,
        select: { productId: true },
      },
    },
  });

  if (!job) return NextResponse.json({ job: null });
  return NextResponse.json({
    job: {
      id: job.id,
      running: job.status === "running",
      paused: job.status === "paused",
      overwriteExisting: job.overwriteExisting,
      total: job.total,
      done: job.done,
      errors: job.errors,
      brand: job.brand,
      catalogue: job.catalogue,
      startedAt: job.startedAt,
      currentProductId: job.items[0]?.productId,
    },
  });
}

